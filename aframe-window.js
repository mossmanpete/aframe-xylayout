"use strict";

// utils.

if (typeof AFRAME === 'undefined') {
    throw 'AFRAME is not loaded.';
}

AFRAME.registerGeometry('xy-rounded-rect', {
    schema: {
        height: { default: 1, min: 0 },
        width: { default: 1, min: 0 },
        radius: { default: 0.05, min: 0 }
    },
    init: function (data) {
        var shape = new THREE.Shape();
        var radius = data.radius;
        var w = data.width || 0.01, h = data.height || 0.01;
        var x = -w / 2, y = -h / 2;
        shape.moveTo(x, y + radius);
        shape.lineTo(x, y + h - radius);
        shape.quadraticCurveTo(x, y + h, x + radius, y + h);
        shape.lineTo(x + w - radius, y + h);
        shape.quadraticCurveTo(x + w, y + h, x + w, y + h - radius);
        shape.lineTo(x + w, y + radius);
        shape.quadraticCurveTo(x + w, y, x + w - radius, y);
        shape.lineTo(x + radius, y);
        shape.quadraticCurveTo(x, y, x, y + radius);
        this.geometry = new THREE.ShapeGeometry(shape);
    }
});

AFRAME.registerSystem('xylayout', {
    defaultButtonGeometry: 'xy-rounded-rect',
    createSimpleButton: function (params, parent, el) {
        params.color = params.color || "#222";
        params.color2 = params.color2 || "#888";
        var geometry = params.geometry || this.defaultButtonGeometry;
        var button = el || document.createElement('a-entity');
        button.classList.add("clickable");
        button.addEventListener('mouseenter', (e) => {
            button.setAttribute("material", { color: params.color2 });
        });
        button.addEventListener('mouseleave', (e) => {
            button.setAttribute("material", { color: params.color });
        });

        button.setAttribute("geometry", { primitive: geometry, width: params.width, height: params.height });
        button.setAttribute("material", { color: params.color });
        if (params.text) {
            var h = (params.height > 0 ? (params.width / params.height * 1.5) : 2) + 2;
            button.setAttribute("text", { value: params.text, wrapCount: Math.max(h, params.text.length), zOffset: 0.01, align: "center" });
        }
        parent && parent.appendChild(button);
        return button;
    },
    addDragHandler: function (target, el, handler) {
        target.classList.add("clickable");
        target.addEventListener('mousedown', (ev) => {
            if (!ev.detail.cursorEl || !ev.detail.cursorEl.components.raycaster) {
                return;
            }
            var draggingRaycaster = ev.detail.cursorEl.components.raycaster.raycaster;
            var dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0).applyMatrix4(el.object3D.matrixWorld);
            var check = (first, last) => {
                var pointw = new THREE.Vector3();
                if (draggingRaycaster.ray.intersectPlane(dragPlane, pointw) !== null) {
                    handler(el.object3D.worldToLocal(pointw), { raycaster: draggingRaycaster, last: last, first: first });
                }
            };
            check(true, false);
            var dragTimer = setInterval(check, 20, false, false);
            window.addEventListener('mouseup', function mouseup() {
                window.removeEventListener('mouseup', mouseup);
                clearInterval(dragTimer);
                check(false, true);
            });
        });
    }
});

AFRAME.registerComponent('xy-drag-rotation', {
    schema: {
        target: { type: 'selector', default: null },
        draggable: { type: 'string', default: "" },
        mode: { type: 'string', default: "pan" }
    },
    init: function () {
        this.target = this.data.target || this.el;
        var draggable = Array.isArray(this.data.draggable) ? this.data.draggable :
            this.data.draggable != "" ? this.el.querySelectorAll(this.data.draggable) : [this.el];

        this.dragLen = 0;
        this.dragThreshold = 0.2;
        this.draggingDirection = null;

        var dragFun = (point, detail) => {
            var direction = detail.raycaster.ray.direction.clone();
            if (detail.first) {
                this.dragLen = 0;
            } else {
                this.dragLen += this.draggingDirection.manhattanDistanceTo(direction);
                if (this.dragLen < this.dragThreshold) return;
                if (this.data.mode == "move") {
                    var d = direction.clone().sub(this.draggingDirection).applyQuaternion(this.el.sceneEl.camera.getWorldQuaternion().inverse());
                    this.target.object3D.position.add(d.multiplyScalar(16).applyQuaternion(this.el.object3D.getWorldQuaternion()));
                } else {
                    var rot = new THREE.Quaternion().setFromUnitVectors(this.draggingDirection, direction);
                    var matrix = new THREE.Matrix4().makeRotationFromQuaternion(rot);
                    var o = detail.raycaster.ray.origin;
                    var tr = new THREE.Matrix4();
                    matrix.multiply(tr.makeTranslation(-o.x, -o.y, -o.z));
                    matrix.premultiply(tr.makeTranslation(o.x, o.y, o.z));
                    this.target.object3D.applyMatrix(matrix);
                }
            }
            this.draggingDirection = direction;
        };
        var clickFun = (ev) => {
            if (this.dragLen > this.dragThreshold && ev.path.includes(this.el)) {
                ev.stopImmediatePropagation();
            }
            this.dragLen = 0;
        };
        for (var i = 0; i < draggable.length; i++) {
            this.el.sceneEl.systems.xylayout.addDragHandler(draggable[i], draggable[i], dragFun);
            draggable[i].parentNode.addEventListener('click', clickFun, true);
        }
    }
});

AFRAME.registerComponent('xywindow', {
    dependencies: ['xycontainer'],
    schema: {
        title: { type: 'string', default: "" },
        closable: { type: 'bool', default: true }
    },
    init: function () {
        this.controls = document.createElement('a-entity');
        this.controls.setAttribute("position", { x: 0, y: 0, z: 0.05 });
        this.el.appendChild(this.controls);

        var dragButton = this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: 1, height: 0.5, color2: "#333"
        }, this.controls);
        dragButton.setAttribute("xy-drag-rotation", { target: this.el });
        this.dragButton = dragButton;

        if (this.data.closable) {
            var closeButton = this.el.sceneEl.systems.xylayout.createSimpleButton({
                width: 0.5, height: 0.5,
                color: "#333", color2: "#f00", text: " X"
            }, this.controls);
            closeButton.addEventListener('click', (ev) => {
                if (this.data.closable) {
                    this.el.parentNode.removeChild(this.el);
                }
            });
            this.closeButton = closeButton;
        }

        this.titleText = document.createElement('a-text');
        this.controls.appendChild(this.titleText);
        this.setTitle(this.data.title);
    },
    update: function () {
    },
    tick: function () {
        var a = 0;
        if (this.closeButton) {
            this.closeButton.setAttribute("position", { x: this.el.components.xyrect.width / 2 - 0.25, y: 0.3, z: 0 });
            a += 0.52;
        }
        this.controls.setAttribute("position", "y", this.el.components.xyrect.height * 0.5);
        this.dragButton.setAttribute("geometry", "width", this.el.components.xyrect.width - a);
        this.dragButton.setAttribute("position", { x: -a / 2, y: 0.3, z: 0 });
        this.titleText.setAttribute("position", { x: -this.el.components.xyrect.width / 2 + 0.3, y: 0.3, z: 0.02 });
        if (this.data.width > 0 && this.data.height > 0) {
            return;
        }
    },
    setTitle: function (title) {
        this.titleText.setAttribute("value", title);
    }
});

AFRAME.registerComponent('xybutton', {
    dependencies: ['xyrect'],
    schema: {
        label: { type: 'string', default: null },
        color2: { type: 'string', default: null }
    },
    init: function () {
        this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: this.el.components.xyrect.width, height: this.el.components.xyrect.height,
            color2: this.data.color2, text: this.data.label
        }, null, this.el);
        this.el.addEventListener('xyresize', (ev) => {
            this.el.setAttribute("geometry", { width: ev.detail.xyrect.width, height: ev.detail.xyrect.height });
        });
    },
    update: function () {
    }
});

AFRAME.registerComponent('xyrange', {
    dependencies: ['xyrect'],
    schema: {
        min: { type: 'number', default: 0 },
        max: { type: 'number', default: 100 },
        step: { type: 'number', default: 0 },
        value: { type: 'number', default: 0 },
        thumbSize: { type: 'number', default: 0.4 }
    },
    init: function () {
        this.value = this.data.value;

        this.bar = document.createElement('a-entity');
        this.bar.setAttribute("geometry", { primitive: "plane", width: this.el.components.xyrect.width - this.data.thumbSize, height: 0.05 });
        this.bar.setAttribute("material", { color: "#fff" });
        this.el.appendChild(this.bar);

        this.thumb = this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: this.data.thumbSize, height: this.data.thumbSize
        }, this.el);
        this.dragging = false;
        this.el.sceneEl.systems.xylayout.addDragHandler(this.thumb, this.el, (point, detail) => {
            this.dragging = true;
            var r = this.el.components.xyrect.width - this.data.thumbSize;
            var p = (point.x + r * 0.5) / r * (this.data.max - this.data.min);
            if (this.data.step > 0) {
                p = Math.round(p / this.data.step) * this.data.step;
            }
            this.setValue(p + this.data.min, true);
            if (detail.last) {
                this.dragging = false;
                this.el.dispatchEvent(new CustomEvent('change', { detail: this.value }));
            }
        });
    },
    update: function () {
        if (this.data.max <= this.data.min) return;
        var r = this.el.components.xyrect.width - this.data.thumbSize;
        this.thumb.setAttribute("position", {
            x: r * (this.data.value - this.data.min) / (this.data.max - this.data.min) - r * 0.5,
            y: 0,
            z: 0.01
        });
    },
    setValue: function (value, force) {
        if (!this.dragging || force) {
            this.value = Math.max(Math.min(value, this.data.max), this.data.min);
            this.el.setAttribute("xyrange", "value", this.value);
        }
    }
});


AFRAME.registerComponent('xyscroll', {
    schema: {
        width: { type: 'number', default: -1 },
        height: { type: 'number', default: -1 },
        scrollbar: { type: 'boolean', default: true }
    },
    init: function () {
        this.scrollX = 0;
        this.scrollY = 0;
        this.speedY = 0;
        this.contentHeight = 0;
        this.scrollDelta = Math.max(this.data.height / 2, 0.5);
        this.control = document.createElement('a-entity');
        this.thumbLen = 0.2;
        this.el.appendChild(this.control);
        this._initScrollBar(this.control, 0.3);

        var draggingPoint = null;
        var dragLen = 0.0;
        this.el.sceneEl.systems.xylayout.addDragHandler(this.el, this.el, (point, detail) => {
            if (detail.first) {
                dragLen = 0.0;
            } else {
                var dy = point.y - draggingPoint.y;
                this.speedY = dy;
                dragLen += Math.abs(dy);
            }
            draggingPoint = point;
        });
        this.el.classList.add("clickable");
        this.el.addEventListener('click', (ev) => {
            if (dragLen > 1) {
                ev.stopPropagation();
            }
        }, true);
    },
    _initScrollBar: function (el, w) {
        this.upButton = this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: w, height: 0.3
        }, el);
        this.upButton.addEventListener('click', (ev) => {
            this.speedY = -this.scrollDelta * 0.3;
        });

        this.downButton = this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: w, height: 0.3
        }, el);
        this.downButton.addEventListener('click', (ev) => {
            this.speedY = this.scrollDelta * 0.3;
        });
        this.scrollThumb = this.el.sceneEl.systems.xylayout.createSimpleButton({
            width: w * 0.7, height: this.thumbLen
        }, el);
        this.el.sceneEl.systems.xylayout.addDragHandler(this.scrollThumb, this.el, (point) => {
            var thumbH = this.thumbLen;
            var scrollY = (this.scrollStart - thumbH / 2 - point.y) * Math.max(0.01, this.contentHeight - this.data.height) / (this.scrollLength - thumbH);
            this.setScroll(this.scrollX, scrollY);
        });
    },
    update: function () {
        this.el.setAttribute("xyrect", { width: this.data.width, height: this.data.height });
        this.el.setAttribute("xyclipping", { exclude: this.control });

        this.upButton.setAttribute('visible', this.data.scrollbar);
        this.upButton.setAttribute("position", { x: this.data.width + 0.1, y: this.data.height - 0.15, z: 0.05 });
        this.downButton.setAttribute('visible', this.data.scrollbar);
        this.downButton.setAttribute("position", { x: this.data.width + 0.1, y: 0.15, z: 0.05 });
        this.scrollThumb.setAttribute('visible', this.data.scrollbar);

        this.scrollStart = this.data.height - 0.3;
        this.scrollLength = this.data.height - 0.6;
        this.setScroll(0, 0);
    },
    tick: function () {
        if (Math.abs(this.speedY) > 0.001) {
            this.setScroll(this.scrollX, this.scrollY + this.speedY);
            this.speedY *= 0.8;
        }
    },
    contentChanged: function () {
        this.update();
        this.setScroll(this.scrollX, this.scrollY);
    },
    setScroll: function (x, y) {
        var children = this.el.children;
        var maxH = 0.001;
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child === this.control) continue;
            if (!child.components.xyrect) {
                child.setAttribute("xyrect", {});
            }
            maxH = Math.max(maxH, child.components.xyrect.height);
        }
        this.contentHeight = maxH;

        this.scrollX = Math.max(0, x);
        this.scrollY = Math.max(0, Math.min(y, this.contentHeight - this.data.height));

        var thumbH = Math.max(0.2, Math.min(this.scrollLength * this.data.height / this.contentHeight, this.scrollLength));
        var thumbY = this.scrollStart - thumbH / 2 - (this.scrollLength - thumbH) * this.scrollY / Math.max(0.01, this.contentHeight - this.data.height);
        this.thumbLen = thumbH;
        this.scrollThumb.hasAttribute("geometry") && this.scrollThumb.setAttribute("geometry", "height", thumbH);
        this.scrollThumb.setAttribute("position", { x: this.data.width + 0.1, y: thumbY, z: 0.05 });

        for (var i = 0; i < children.length; i++) {
            var item = children[i];
            if (item === this.control) continue;
            if (item.classList.contains("xyscroll-fixed")) {
                continue;
            }
            var pos = item.getAttribute("position");
            pos.x = -this.scrollX + item.components.xyrect.data.pivotX * item.components.xyrect.width;
            pos.y = this.scrollY - (1.0 - item.components.xyrect.data.pivotY) * item.components.xyrect.height + this.data.height;
            item.setAttribute("position", pos);
            if (item.components.xylist) {
                var t = item.components.xyrect.height - this.scrollY;
                item.components.xylist.setRect(t, t - this.data.height, this.scrollX, this.scrollX + this.data.width);
            }
        }
        if (this.el.components.xyclipping) {
            this.el.components.xyclipping.applyClippings();
        }
    }
});

AFRAME.registerComponent('xylist', {
    schema: {
        width: { type: 'number', default: -1 },
        itemHeight: { type: 'number', default: -1 },
        vertical: { type: 'boolean', default: true }
    },
    init: function () {
        this.elementFactory = null;
        this.elementUpdator = null;
        this.elements = [];
        this.userData = null;
        this.itemCount = 0;
        this.itemClicked = null;
        this.el.setAttribute("xyrect", { width: this.data.width, height: this.data.itemHeight, pivotX: 0, pivotY: 0 });
        this.setRect(0, 0, 0, 0);
        this.el.classList.add("clickable");
        this.el.addEventListener('click', (ev) => {
            for (var i = 0; i < ev.path.length; i++) {
                if (ev.path[i].parentNode == this.el && ev.path[i].dataset.listPosition != null) {
                    this.itemClicked && this.itemClicked(ev.path[i].dataset.listPosition, ev);
                    break;
                }
            }
        });
    },
    setCallback(f, u) {
        this.elementFactory = f || this.elementFactory;
        this.elementUpdator = u || this.elementUpdator;
        if (this.data.itemHeight < 0) {
            var el = this.elementFactory(this.el, this.userData);
            this.data.itemHeight = el.getAttribute("height") * 1.0;
        }
    },
    setContents: function (data, size) {
        this.userData = data;
        this.itemCount = size != null ? size : data.length;
        var hh = this.data.itemHeight * this.itemCount;
        this.el.setAttribute("xyrect", { width: this.data.width, height: hh });
        for (var t = 0; t < this.elements.length; t++) {
            this.elements[t].setAttribute('visible', false);
            this.elements[t].dataset.listPosition = -1;
        }
        var scroll = this.el.parentNode.components.xyscroll;
        if (scroll) {
            scroll.contentChanged();
        }
        this.refresh();
    },
    setRect: function (t, b, l, r) {
        this.top = t;
        this.bottom = b;
        this.refresh();
    },
    refresh: function () {
        if (!this.elementFactory) return;
        var hh = this.data.itemHeight * this.itemCount;
        var st = Math.max(Math.floor((hh - this.top) / this.data.itemHeight), 0);
        var en = Math.min(Math.ceil((hh - this.bottom) / this.data.itemHeight), this.itemCount);
        var n = en - st + 1;
        if (n > this.elements.length) {
            // TODO: compaction
            while (n > this.elements.length) {
                var el = this.elementFactory(this.el, this.userData);
                el.dataset.listPosition = -1;
                el.classList.add("clickable");
                this.el.appendChild(el);
                this.elements.push(el);
            }
        }
        var retry = false;
        for (var position = st; position < en; position++) {
            retry |= !this.updateElement(position);
        }
        if (retry) setTimeout(this.refresh.bind(this), 100);

        for (var t = 0; t < this.elements.length; t++) {
            var p = this.elements[t].dataset.listPosition;
            this.elements[t].setAttribute('visible', p >= st && p < en);
        }
    },
    updateElement: function (position) {
        var el = this.elements[position % this.elements.length];
        if (!el.hasLoaded) return false;
        if (el.dataset.listPosition == position) return true;
        el.dataset.listPosition = position;
        var x = 0.0, y = (this.itemCount - position - 1) * this.data.itemHeight;
        if (el.components.xyrect) {
            x += el.components.xyrect.data.pivotX * el.components.xyrect.width;
            y += el.components.xyrect.data.pivotY * el.components.xyrect.height;
        }
        el.setAttribute("position", { x: x, y: y, z: 0 });
        this.elementUpdator && this.elementUpdator(position, el, this.userData);
        return true;
    },
});

AFRAME.registerComponent('xycanvas', {
    schema: {
        width: { type: 'number', default: 100 },
        height: { type: 'number', default: 100 }
    },
    init: function () {
        this.canvas = document.createElement("canvas");

        // to Avoid a-frame bugs.
        this.canvas.id = "_CANVAS" + Math.random();
        var src = new THREE.CanvasTexture(this.canvas);
        this.updateTexture = function () {
            src.needsUpdate = true;
        };

        this.el.setAttribute('material', { shader: "flat", npot: true, src: src, transparent: true });
    },
    update: function () {
        this.canvas.width = this.data.width;
        this.canvas.height = this.data.height;
    }
});

AFRAME.registerPrimitive('a-xywindow', {
    defaultComponents: {
        xycontainer: { alignItems: "stretch" },
        xywindow: {}
    },
    mappings: {
        width: 'xycontainer.width',
        height: 'xycontainer.height',
        direction: 'xycontainer.direction',
        title: 'xywindow.title'
    }
});

AFRAME.registerPrimitive('a-xyscroll', {
    defaultComponents: {
        xyrect: { pivotX: 0, pivotY: 0 },
        xyscroll: {}
    },
    mappings: {
        width: 'xyscroll.width',
        height: 'xyscroll.height',
        scrollbar: 'xyscroll.scrollbar'
    }
});

AFRAME.registerPrimitive('a-xybutton', {
    defaultComponents: {
        xyrect: {},
        xybutton: {}
    },
    mappings: {
        width: 'xyrect.width',
        height: 'xyrect.height',
        label: 'xybutton.label'
    }
});


AFRAME.registerPrimitive('a-xyrange', {
    defaultComponents: {
        xyrect: {},
        xyrange: {}
    },
    mappings: {
        min: 'xyrange.min',
        max: 'xyrange.max',
        step: 'xyrange.step',
        value: 'xyrange.value',
        width: 'xyrect.width',
        height: 'xyrect.height'
    }
});

class XYWindow {
    static currentWindow(el) {
        if (!el || !el.components) return null;
        if (el.components.xywindow) return el.components.xywindow;
        return XYWindow.currentWindow(el.parentNode);
    }
}
