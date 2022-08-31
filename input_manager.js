var INPUT_MANAGER = (function () {
    let input_context = function (mgr) {
        this.mgr = mgr;
        this.handlers = {
            on_mousedown: this.on_mousedown.bind(this),
            on_mousemove: this.on_mousemove.bind(this),
            on_mouseup: this.on_mouseup.bind(this),
            on_touchstart: this.on_touchstart.bind(this),
            on_touchend: this.on_touchend.bind(this),
            on_touchcancel: this.on_touchcancel.bind(this),
            on_touchmove: this.on_touchmove.bind(this),
        };
        this.callbacks = {};
        this.states = {};
    }
    input_context.prototype.init = function (target) {
        this.target = target;
        this.target.addEventListener('mousedown', this.handlers.on_mousedown);
        this.target.addEventListener('mousemove', this.handlers.on_mousemove);
        this.target.addEventListener('mouseup', this.handlers.on_mouseup);
        this.target.addEventListener('touchstart', this.handlers.on_touchstart);
        this.target.addEventListener('touchend', this.handlers.on_touchend);
        this.target.addEventListener('touchcancel', this.handlers.on_touchcancel);
        this.target.addEventListener('touchmove', this.handlers.on_touchmove);
    }
    input_context.prototype.deinit = function () {
        this.target.removeEventListener('mousedown', this.handlers.on_mousedown);
        this.target.removeEventListener('mousemove', this.handlers.on_mousemove);
        this.target.removeEventListener('mouseup', this.handlers.on_mouseup);
        this.target.removeEventListener('touchstart', this.handlers.on_touchstart);
        this.target.removeEventListener('touchend', this.handlers.on_touchend);
        this.target.removeEventListener('touchcancel', this.handlers.on_touchcancel);
        this.target.removeEventListener('touchmove', this.handlers.on_touchmove);
        this.target = null;
    }
    input_context.prototype.on_mousedown = function (e) {
        e.preventDefault();
        this.states[0] = {
            started: true,
            start_x: e.clientX,
            start_y: e.clientY
        };
        this.call_listeners('touchstart', {
            identifier: e.buttons - 1,
            x: e.clientX,
            y: e.clientY
        }, e);
    }
    input_context.prototype.on_mousemove = function (e) {
        e.preventDefault();
        let state = this.states[0];
        if (state && state.started) { } else {
            return;
        }
        let delta_x = e.clientX - state.start_x;
        let delta_y = e.clientY - state.start_y;
        const sensitivity = this.mgr.sensitivity * this.mgr.sensitivity;
        if (delta_x * delta_x + delta_y * delta_y > sensitivity) {
            state.moved = true;
        }
        this.call_listeners('moved', {
            identifier: e.buttons - 1,
            x: e.clientX,
            y: e.clientY
        }, e);
    }
    input_context.prototype.on_mouseup = function (e) {
        e.preventDefault();
        let state = this.states[0];
        this.call_listeners('touchend', {
            identifier: e.buttons - 1,
            start_x: state.start_x,
            start_y: state.start_y,
            x: e.clientX,
            y: e.clientY
        }, e);
        if (state.started && !state.moved) {
            this.call_listeners('touched', {
                identifier: e.buttons - 1,
                x: e.clientX,
                y: e.clientY
            }, e);
        }
        this.states[0] = {};
    }
    input_context.prototype.on_touchstart = function (e) {
        e.preventDefault();
        for (let i = 0; i < e.touches.length; ++i) {
            let t = e.touches[i];
            this.states[t.identifier] = {
                started: true,
                start_x: t.clientX,
                start_y: t.clientY
            };
            this.call_listeners('touchstart', {
                identifier: t.identifier,
                x: t.clientX,
                y: t.clientY
            }, t);
        }
    }
    input_context.prototype.on_touchend = function (e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; ++i) {
            const t = e.changedTouches[i];
            let state = this.states[t.identifier];
            this.call_listeners('touchend', {
                identifier: t.identifier,
                start_x: state.start_x,
                start_y: state.start_y,
                x: t.clientX,
                y: t.clientY
            }, t);
            if (state.started && !state.moved) {
                this.call_listeners('touched', {
                    identifier: t.identifier,
                    x: t.clientX,
                    y: t.clientY
                }, t);
            }
            this.states[t.identifier] = {};
        }
    }
    input_context.prototype.on_touchcancel = function (e) {
        e.preventDefault();
        for (let i = 0; i < e.touches.length; ++i) {
            let t = e.touches[i];
            this.call_listeners('canceled', {
                identifier: t.identifier,
            }, t);
        }
    }
    input_context.prototype.on_touchmove = function (e) {
        e.preventDefault();
        for (let i = 0; i < e.touches.length; ++i) {
            let t = e.touches[i];
            let state = this.states[t.identifier];
            state.moved = true;
            this.call_listeners('moved', {
                identifier: t.identifier,
                x: t.clientX,
                y: t.clientY
            }, t);
        }
    }
    input_context.prototype.call_listeners = function (event_type, e, v) {
        if (this.callbacks[event_type]) { } else {
            return;
        }
        for (let i = 0; i < this.callbacks[event_type].length; ++i) {
            this.callbacks[event_type][i](e, v);
        }
    }
    input_context.prototype.add_listener = function (event_type, callback) {
        if (this.callbacks[event_type]) { } else {
            this.callbacks[event_type] = [];
        }
        this.callbacks[event_type].push(callback);
    }
    input_context.prototype.remove_listener = function (event_type, callback) {
        if (this.callbacks[event_type]) { } else {
            return;
        }
        const i = this.callbacks[event_type].indexOf(callback);
        if (i > -1) {
            this.callbacks[event_type].splice(i, 1);
        }
    }
    input_context.prototype.remove_all_listener = function (event_type) {
        this.callbacks[event_type] = [];
    }
    /*
    * input_manager
    */
    let input_manager = function () {
        this.contexts = {};
    };
    input_manager.prototype.listen = function (target) {
        if (this.contexts[target]) {
            return;
        }
        let ctx = new input_context(this);
        ctx.init(target);
        this.contexts[target] = ctx;
    }
    input_manager.prototype.not_listen = function (target) {
        if (this.contexts[target]) {
            this.contexts[target].deinit();
            this.contexts[target] = null;
        }
    }
    input_manager.prototype.add_listener = function (target, event_type, callback) {
        let ctx = this.contexts[target];
        console.assert(ctx);
        ctx.add_listener(event_type, callback);
    }
    input_manager.prototype.remove_listener = function (target, event_type, callback) {
        let ctx = this.contexts[target];
        console.assert(ctx);
        ctx.remove_listener(event_type, callback);
    }
    input_manager.prototype.remove_all_listener = function (target, event_type) {
        let ctx = this.contexts[target];
        console.assert(ctx);
        ctx.remove_all_listener(event_type);
    }
    return new input_manager();
})();