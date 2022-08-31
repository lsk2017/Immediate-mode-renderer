var mat4 = glMatrix.mat4;

let IMR = (function () {
    function IMRUTIL() {
    }
    IMRUTIL.get_min_power_of_2 = function (n) {
        if ((n & -n) == n) return n;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        n++;
        return n;
    }

    function IMRBUFFER(args) {
        console.assert(args.gl !== undefined);
        console.assert(args.target !== undefined);
        console.assert(args.usage !== undefined);
        console.assert(args.size !== undefined);

        this.gl = args.gl;
        this.target = args.target;
        this.usage = args.usage;
        this.size = IMRUTIL.get_min_power_of_2(args.size);
        this.buffer = gl.createBuffer();
        this.data = new Float32Array(this.size);
        gl.bindBuffer(args.target, this.buffer);
        gl.bufferData(
            args.target,
            this.data.byteLength,
            args.usage
        );
        gl.bindBuffer(args.target, null);
    }

    IMRBUFFER.prototype.bind = function () {
        this.gl.bindBuffer(this.target, this.buffer);
        this.binding = true;
    }

    IMRBUFFER.prototype.unbind = function () {
        this.gl.bindBuffer(this.target, null);
        this.binding = false;
    }

    IMRBUFFER.prototype.destory = function () {
        console.assert(this.buffer !== undefined);
        this.gl.deleteBuffer(this.buffer);
        this.data = null;
    }

    function IMRPROGRAM(gl, vs, fs) {
        this.gl = gl;
        this.attrib_locations = {};
        this.uniform_locations = {};

        const vertex_shader = this.load_shader(gl.VERTEX_SHADER, vs);
        const fragment_shader = this.load_shader(gl.FRAGMENT_SHADER, fs);

        const program = gl.createProgram();
        gl.attachShader(program, vertex_shader);
        gl.attachShader(program, fragment_shader);
        gl.linkProgram(program);

        console.assert(gl.getProgramParameter(program, gl.LINK_STATUS), 'unable to initialize the shader program');
        gl.deleteShader(vertex_shader);
        gl.deleteShader(fragment_shader);

        this.program = program;
        this.vertex_shader_code = vs;
        this.fragment_shader_code = fs;

        this._bind_all_slow();
    }

    IMRPROGRAM.prototype.load_shader = function (type, source) {
        let gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    IMRPROGRAM.prototype._bind_attrib_location = function (name) {
        this.attrib_locations[name] = this.gl.getAttribLocation(this.program, name);
    }

    IMRPROGRAM.prototype._bind_uniform_location = function (name) {
        this.uniform_locations[name] = this.gl.getUniformLocation(this.program, name);
    }

    IMRPROGRAM.prototype._bind_all_slow = function () {
        let bind_func = (regex, source, bind_func) => {
            const matches = [...source.matchAll(regex)];
            matches.map((v, idx) => {
                let name = v[2];
                if (v[3] !== undefined) {
                    name += '[0]';
                }
                bind_func(name);
            });
        }
        const attr_reg = /^.?\s*?attribute\s+(.+)\s+([a-zA-Z0-9]+)\s*;/gm;
        bind_func(attr_reg, this.vertex_shader_code, this._bind_attrib_location.bind(this));
        bind_func(attr_reg, this.fragment_shader_code, this._bind_attrib_location.bind(this));

        const uniform_reg = /^.?\s*?uniform\s+(.+)\s+([a-zA-Z0-9]+)(\[(.+)\])?\s*;/gm;
        bind_func(uniform_reg, this.vertex_shader_code, this._bind_uniform_location.bind(this));
        bind_func(uniform_reg, this.fragment_shader_code, this._bind_uniform_location.bind(this));
    }

    IMRPROGRAM.prototype.get_attrib_location = function (name) {
        console.assert(this.attrib_locations[name] !== undefined);
        return this.attrib_locations[name];
    }

    IMRPROGRAM.prototype.get_uniform_location = function (name) {
        console.assert(this.uniform_locations[name] !== undefined, name);
        return this.uniform_locations[name];
    }

    IMRPROGRAM.prototype.use = function () {
        this.gl.useProgram(this.program);
    }

    IMRPROGRAM.prototype.unuse = function () {
        this.gl.useProgram(null);
    }

    IMRPROGRAM.prototype.destroy = function () {
        console.assert(this.program !== undefined);
        this.gl.deleteProgram(this.program);
        this.program = undefined;
    }

    function IMRFRAME(context, width, height, mrt_count) {
        console.assert(width > 0 && height > 0, 'frame buffer size must larger than zero');

        this.context = context;
        // mrt not supported on mobile
        this.mrt_count = 1; //Math.min(mrt_count ?? 1, 4); 
        this.texture_infoes = [];

        let gl = context.gl;
        let ext = context.ext;

        // create frame buffer
        this.frame_buffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame_buffer);

        // create render texture
        // this.attaches = [ext.draw_buffers.COLOR_ATTACHMENT0_WEBGL];
        // if (this.mrt_count == 2) this.attaches.push(ext.draw_buffers.COLOR_ATTACHMENT1_WEBGL);
        // if (this.mrt_count == 3) this.attaches.push(ext.draw_buffers.COLOR_ATTACHMENT2_WEBGL);
        // if (this.mrt_count == 4) this.attaches.push(ext.draw_buffers.COLOR_ATTACHMENT3_WEBGL);
        this.attaches = [gl.COLOR_ATTACHMENT0];
        for (let i = 0; i < this.mrt_count; ++i) {
            let frame_texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, frame_texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, this.attaches[i], gl.TEXTURE_2D, frame_texture, 0);
            this.texture_infoes.push({ texture: frame_texture, width: width, height: height, attach: i });
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    IMRFRAME.prototype.bind = function () {
        let gl = this.context.gl;
        let ext = this.context.ext;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame_buffer);
        // ext.draw_buffers.drawBuffersWEBGL(this.attaches);
    }

    IMRFRAME.prototype.unbind = function () {
        let gl = this.context.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    IMRFRAME.prototype.destroy = function () {
        console.assert(this.frame_buffer !== undefined);
        let gl = this.context.gl;
        gl.deleteFramebuffer(this.frame_buffer);
        this.frame_buffer = undefined;

        for (let i = 0; i < this.texture_infoes.length; ++i) {
            gl.deleteTexture(this.texture_infoes[i].texture);
        }
    }

    function IMR_impl() {
        this.context = {
            gl: null,
            textures: {},
            buffers: {},
            programs: {},
        };
    }

    IMR_impl.FLOAT_SIZE = 4;

    IMR_impl.prototype.initialize = function (args) {
        console.assert(args.gl != null, 'gl should be not null');

        this.context.gl = args.gl;
        this.context.gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        // load ext
        this.context.ext = {}
        {
            // instance arrays
            this.context.ext.instanced_arrays = gl.getExtension('ANGLE_instanced_arrays');
            console.assert(this.context.ext.instanced_arrays, 'need ANGLE_instanced_arrays');
            // android chrome does not support draw buffers ext
            // this.context.ext.draw_buffers = gl.getExtension('WEBGL_draw_buffers');
            // console.assert(this.context.ext.draw_buffers, 'need WEBGL_draw_buffers');
        }

        // prepare default system
        this._init_buffers();
        this.context.programs.default = this._create_default_program();
    }

    IMR_impl.prototype.alloc_dynamic_array_buffer = function (size) {
        let gl = this.context.gl;
        this.context.dynamic_array_buffer_pool = this.context.dynamic_array_buffer_pool ?? {};
        return this._alloc_buffer_impl(size, this.context.dynamic_array_buffer_pool, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    }

    IMR_impl.prototype.free_dynamic_array_buffer = function (buffer) {
        this._free_buffer_impl(buffer, this.context.dynamic_array_buffer_pool);
    }

    IMR_impl.prototype.alloc_dynamic_element_array_buffer = function (size) {
        let gl = this.context.gl;
        this.context.dynamic_element_array_buffer_pool = this.context.dynamic_element_array_buffer_pool ?? {};
        return this._alloc_buffer_impl(size, this.context.dynamic_element_array_buffer_pool, gl.ELEMENT_ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    }

    IMR_impl.prototype.free_dynamic_element_array_buffer = function (buffer) {
        this._free_buffer_impl(buffer, this.context.dynamic_element_array_buffer_pool);
    }

    IMR_impl.prototype._alloc_buffer_impl = function (size, pool, target, usage) {
        let proper_size = IMRUTIL.get_min_power_of_2(size);
        let buffer_pool = pool[proper_size];
        if (buffer_pool === undefined) {
            buffer_pool = [];
            pool[proper_size] = buffer_pool;
        }
        let ret;
        if (buffer_pool.length > 0) {
            ret = buffer_pool.pop();
        }
        else {
            ret = new IMRBUFFER({
                gl: this.context.gl,
                size: proper_size,
                target: target,
                usage: usage,
            });
        }
        return ret;
    }

    IMR_impl.prototype._free_buffer_impl = function (buffer, pool) {
        let buffer_pool = pool[buffer.size];
        console.assert(buffer_pool);
        console.assert(!buffer.binding);
        buffer_pool.push(buffer);
    }

    IMR_impl.prototype._init_buffers = function () {
        let gl = this.context.gl;

        // attribute buffer
        const attrib_buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, attrib_buffer);
        const positions = [
            0, 0,
            0, 1,
            1, 1,
            1, 0,
        ];
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(positions),
            gl.STATIC_DRAW
        );

        // inidice buffer
        const index_buffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer);
        const indices = [
            0, 1, 2, 2, 3, 0
        ];
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        // output
        this.context.buffers.attrib_buffer = attrib_buffer;
        this.context.buffers.index_buffer = index_buffer;

        // reset
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    IMR_impl.prototype._create_default_program = function () {
        const default_vs_source =
            `
                attribute vec4 aPosition;
                attribute vec4 aTranslateScale;
                attribute vec4 aRotationSpriteId;

                // additional attribute

                uniform mat4 uViewMatrix;
                uniform mat4 uProjectionMatrix;
                uniform vec2 uAtlasResolution;
                uniform vec4 uAtlasInfoes[128];

                // additional uniform

                varying vec2 vTexCoord;

                // additional varying

                void main()
                {
                    vec4 pos = aPosition - vec4(0.5, 0.5, 0, 0);

                    // scale
                    pos.xy *= aTranslateScale.zw;
                    // rotation
                    float rotation = aRotationSpriteId.x;
                    float tmp_x = pos.x;
                    pos.x = pos.x*cos(rotation) - pos.y*sin(rotation);
                    pos.y = tmp_x*sin(rotation) + pos.y*cos(rotation);
                    // transition
                    pos.xy += aTranslateScale.xy;

                    // coord
                    int sprite_id = int(aRotationSpriteId.y);
                    vec4 atlas_info = uAtlasInfoes[sprite_id];
                    vec2 coord = (aPosition.xy * atlas_info.zw + atlas_info.xy) / uAtlasResolution;

                    // output
                    gl_Position = uProjectionMatrix * uViewMatrix * pos;
                    vTexCoord = coord;
                }
            `;

        const default_ps_source =
            `
                // #extension GL_EXT_draw_buffers : require
                precision highp float;

                uniform sampler2D uSampler;

                // additional sampler

                varying vec2 vTexCoord;

                // additional varying

                void main()
                {
                    vec4 col = texture2D(uSampler, vTexCoord);

                    // additional logic

                    // gl_FragData[0] = col;
                    gl_FragColor = col;
                }
            `;

        const default_program = new IMRPROGRAM(this.context.gl, default_vs_source, default_ps_source);
        return default_program;
    }

    IMR_impl.prototype.destroy = function (args) {
        let gl = this.context.gl;

        // delete buffers
        gl.deleteBuffer(this.context.buffers.attrib_buffer);
        gl.deleteBuffer(this.context.buffers.index_buffer);
        this.context.buffers = {};

        for (const [size, pool] of Object.entries(this.context.dynamic_array_buffer_pool)) {
            for (let i = 0; i < pool.length; ++i) {
                pool[i].destory();
            }
        }
        this.context.dynamic_array_buffer_pool = {};

        this.context.dynamic_element_array_buffer_pool = this.context.dynamic_element_array_buffer_pool || {};
        for (const [size, pool] of Object.entries(this.context.dynamic_element_array_buffer_pool)) {
            for (let i = 0; i < pool.length; ++i) {
                pool[i].destory();
            }
        }
        this.context.dynamic_element_array_buffer_pool = {};

        // delete programs
        for (const [program_name, program] of Object.entries(this.context.programs)) {
            program.destroy();
        }
        this.context.programs = {};

        // delete textures
        for (const [texture_name, texture_info] of Object.entries(this.context.textures)) {
            gl.deleteTexture(texture_info.texture);
        }
        this.context.textures = {};

        // delete frames
        for (const [frame_name, frame] of Object.entries(this.context.frames)) {
            frame.destroy();
        }
        this.context.frames = {};
    }

    IMR_impl.prototype.load_textures = function (textures) {
        for (let i = 0; i < textures.length; ++i) {
            this.load_texture(textures[i]);
        }
    }

    IMR_impl.prototype.load_texture = function (args) {
        let url = args.url;

        function isPowerOf2(value) {
            return (value & (value - 1)) == 0;
        }

        let gl = this.context.gl;
        let ret = { texture: null, width: 1, height: 1 };
        ret.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, ret.texture);

        const level = 0;
        const internalFormat = gl.RGBA;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array([0, 250, 0, 255]);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            ret.width, ret.height, border, srcFormat, srcType,
            pixel);
        gl.bindTexture(gl.TEXTURE_2D, null);

        const image = new Image();
        image.onload = function () {
            ret.width = image.width;
            ret.height = image.height;

            gl.bindTexture(gl.TEXTURE_2D, ret.texture);
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                srcFormat, srcType, image);

            if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            gl.bindTexture(gl.TEXTURE_2D, null);
        };
        image.src = url;

        let texture_name = args.name ?? args.url;
        this.context.textures[texture_name] = ret;

        return ret;
    }

    IMR_impl.prototype.set_screen_size = function (width, height) {
        this.context.screen_width = width;
        this.context.screen_height = height;

        // invalidate frame buffers
        if (this.context.frames) {
            for (const [k, frame] of Object.entries(this.context.frames)) {
                frame.destroy();
            }
            this.context.frames = {};
        }
    }

    IMR_impl.prototype.push_state = function (name, state) {
        this.context.state_stack_map = this.context.state_stack_map ?? {};
        let state_stack = this.context.state_stack_map[name];
        if (state_stack === undefined) {
            state_stack = [];
            this.context.state_stack_map[name] = state_stack;
        }
        state_stack.push(state);
    }

    IMR_impl.prototype.get_current_state = function (name) {
        return this.top_state(name);
    }

    IMR_impl.prototype.top_state = function (name) {
        console.assert(this.context.state_stack_map[name] !== undefined);
        console.assert(this.context.state_stack_map[name].length > 0);
        let state_stack = this.context.state_stack_map[name];
        return state_stack[state_stack.length - 1];
    }

    IMR_impl.prototype.empty_state = function (name) {
        return this.context.state_stack_map[name] === undefined || this.context.state_stack_map[name].length == 0;
    }

    IMR_impl.prototype.pop_state = function (name) {
        console.assert(this.context.state_stack_map[name] !== undefined);
        console.assert(this.context.state_stack_map[name].length > 0);
        return this.context.state_stack_map[name].pop();
    }

    IMR_impl.prototype.push_blend_func = function (src, dst) {
        if (this.empty_state('blendfunc') == false) {
            let cur = this.top_state('blendfunc');
            if (cur[0] == src && cur[1] == dst) { } else {
                this.context.gl.blendFunc(src, dst);
            }
        }
        else {
            this.context.gl.blendFunc(src, dst);
        }
        this.push_state('blendfunc', [src, dst]);
    }

    IMR_impl.prototype.pop_blend_func = function () {
        let old = this.pop_state('blendfunc');
        if (this.empty_state('blendfunc') == false) {
            const cur = this.top_state('blendfunc');
            if (cur[0] != old[0] || cur[1] != old[1]) {
                this.context.gl.blendFunc(cur[0], cur[1]);
            }
        }
    }

    IMR_impl.prototype.begin_camera = function (args) {
        let gl = this.context.gl;
        let ctx = { begin_camera: true };
        this.push_state('begin_camera', ctx);

        ctx.frame_name = args.frame_name ?? args.render_target;
        ctx.frame_width = args.width ?? args.frame_width ?? this.context.screen_width;
        ctx.frame_height = args.height ?? args.frame_height ?? this.context.screen_height;
        this.push_viewport(0, 0, ctx.frame_width, ctx.frame_height);

        if (ctx.frame_name !== undefined) {
            this.context.frames = this.context.frames ?? {};
            ctx.frame = this.context.frames[ctx.frame_name];
            if (ctx.frame) { } else {
                ctx.frame = new IMRFRAME(this.context, ctx.frame_width, ctx.frame_height);
                this.context.frames[ctx.frame_name] = ctx.frame;
            }
            ctx.frame.bind();
        }
        let clear_color = args.clear_color ?? [0, 0, 0, 0];
        gl.clearColor(clear_color[0], clear_color[1], clear_color[2], clear_color[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);

        this.push_blend_func(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // default camera
        this.push_state('projection_matrix', mat4.create());
        this.push_state('view_matrix', mat4.create());
        this.camera();
    }

    IMR_impl.prototype.end_camera = function (args) {
        let ctx = this.get_current_state('begin_camera');
        console.assert(ctx.begin_camera);
        this.pop_state('begin_camera');
        this.pop_state('projection_matrix');
        this.pop_state('view_matrix');
        this.pop_blend_func();
        this.pop_viewport();
        if (ctx.frame) {
            ctx.frame.unbind();
        }
    }

    IMR_impl.prototype.camera = function (args) {
        let ctx = this.get_current_state('begin_camera');
        console.assert(ctx.begin_camera);

        if (!args) {
            args = {
                width: ctx.frame_width,
                height: ctx.frame_height,
                no_transform: true,
            };
        }

        let projection_matrix = this.get_current_state('projection_matrix');
        let view_matrix = this.get_current_state('view_matrix');

        let frame_width = args.width ?? args.frame_width ?? ctx.frame_width;
        let frame_height = args.height ?? args.frame_height ?? ctx.frame_height;
        mat4.identity(projection_matrix);
        mat4.orthoNO(
            projection_matrix,
            0.0, frame_width,
            0.0, frame_height,
            -10, 100
        );

        let translate = args.translate ?? [0, 0, 0, 0];
        let scale = args.scale ?? [1, 1, 1];
        let rotation = args.rotation ?? 0;

        mat4.identity(view_matrix);
        if (!args.no_transform) {
            mat4.scale(view_matrix, view_matrix, [scale[0], scale[1], 1]);
            mat4.rotate(view_matrix, view_matrix, rotation, [0, 0, 1]);
            mat4.translate(view_matrix, view_matrix, [translate[0], translate[1], 1.0]);
            mat4.invert(view_matrix, view_matrix);
        }
    }

    IMR_impl.prototype.draw_sprite = function (args) {
        args.instance_count = 1;
        this.begin_atlas(args);
        this.draw_atlas(args);
        this.end_atlas();
    }

    IMR_impl.prototype.begin_atlas = function (args) {
        let ctx = {};
        this.push_state('begin_atlas', ctx);
        ctx.begin_atlas = true;
        ctx.draw_count = 0;
        ctx.instance_count = args.instance_count ?? 128;

        ctx.INSTANCE_FORMAT_COUNT = 6; // x, y, scale_x, scale_y, rotation, sprite_id
        ctx.instance_buffer = this.alloc_dynamic_array_buffer(ctx.instance_count * ctx.INSTANCE_FORMAT_COUNT);

        if (args.texture_name) {
            ctx.texture_info = this.get_texture_info(args.texture_name);
        } else if (args.frame_name || args.render_target) {
            console.assert(this.context.frames !== undefined);
            let frame = this.context.frames[args.frame_name ?? args.render_target];
            let attach_idx = args.attach_idx ?? 0;
            ctx.texture_info = frame.texture_infoes[attach_idx];
        }
        else {
            ctx.texture_info = { texture: null, width: 1, height: 1 };
        }
        ctx.atlas_infoes = args.atlas_infoes ?? [0, 0, ctx.texture_info.width, ctx.texture_info.height];
        return true;
    }

    IMR_impl.prototype.draw_atlas = function (args) {
        let ctx = this.get_current_state('begin_atlas');
        console.assert(ctx.begin_atlas);

        let translate = args.translate ?? [0, 0, 0, 1];
        let rotation = args.rotation ?? 0;
        let scale = args.scale ?? [ctx.texture_info.width, ctx.texture_info.height, 1];
        let sprite_id = args.sprite_id ?? 0;

        // x, y, scale_x, scale_y, rotation, sprite_id
        const offset = ctx.draw_count * IMR_impl.FLOAT_SIZE * ctx.INSTANCE_FORMAT_COUNT;
        let instance = new Float32Array(ctx.instance_buffer.data.buffer, offset, ctx.INSTANCE_FORMAT_COUNT);
        // translate
        instance[0] = translate[0];
        instance[1] = translate[1];
        // scale
        instance[2] = scale[0];
        instance[3] = scale[1];
        // rotation
        instance[4] = rotation;
        // sprite_id
        instance[5] = sprite_id;

        ctx.draw_count++;
    }

    IMR_impl.prototype.end_atlas = function (args) {
        let ctx = this.pop_state('begin_atlas');
        console.assert(ctx.begin_atlas);

        let gl = this.context.gl;
        let ext = this.context.ext;

        let program_info = this.context.programs.default;
        console.assert(program_info, 'no such program');

        program_info.use();

        // projection view matrix
        {
            let projection_matrix = this.get_current_state('projection_matrix');
            let view_matrix = this.get_current_state('view_matrix');

            gl.uniformMatrix4fv(
                program_info.get_uniform_location('uProjectionMatrix'),
                false,
                projection_matrix
            );
            gl.uniformMatrix4fv(
                program_info.get_uniform_location('uViewMatrix'),
                false,
                view_matrix
            );
        }

        // texture
        {
            // resolution
            gl.uniform2f(program_info.get_uniform_location('uAtlasResolution'), ctx.texture_info.width, ctx.texture_info.height);

            // atlas info
            let loc = program_info.get_uniform_location('uAtlasInfoes[0]');
            gl.uniform4fv(loc, ctx.atlas_infoes);

            // sampler
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, ctx.texture_info.texture);
            gl.uniform1i(program_info.get_uniform_location('uSampler'), 0);
        }

        // bind attrib buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.context.buffers.attrib_buffer);
        {
            // pos_scale
            let loc = program_info.get_attrib_location('aPosition');
            let stride = IMR_impl.FLOAT_SIZE * 2;
            let offset = 0;
            gl.vertexAttribPointer(
                loc,
                2,
                gl.FLOAT,
                false,
                stride,
                offset
            );
            gl.enableVertexAttribArray(loc);
        }

        // bind instance buffer
        ctx.instance_buffer.bind();
        {
            const stride = IMR_impl.FLOAT_SIZE * ctx.INSTANCE_FORMAT_COUNT;

            // translate scale
            let loc = program_info.get_attrib_location('aTranslateScale');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(
                loc,
                4,
                gl.FLOAT,
                false,
                stride,
                0
            );
            ext.instanced_arrays.vertexAttribDivisorANGLE(loc, 1);

            // rotation sprite_id, etc
            loc = program_info.get_attrib_location('aRotationSpriteId');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(
                loc,
                2,
                gl.FLOAT,
                false,
                stride,
                4 * IMR_impl.FLOAT_SIZE
            );
            ext.instanced_arrays.vertexAttribDivisorANGLE(loc, 1);

            gl.bufferSubData(gl.ARRAY_BUFFER, 0, ctx.instance_buffer.data, 0, ctx.draw_size * ctx.INSTANCE_FORMAT_COUNT * IMR_impl.FLOAT_SIZE);
        }

        // bind index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.context.buffers.index_buffer);

        // draw
        ext.instanced_arrays.drawElementsInstancedANGLE(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, ctx.draw_count);
        console.assert(!gl.getError(), 'draw fail');

        ctx.instance_buffer.unbind();
        this.free_dynamic_array_buffer(ctx.instance_buffer);
    }

    IMR_impl.prototype.point_light = function (args) {
        let gl = this.context.gl;

        const pi360 = Math.PI * 2;
        let inner_angle = args.inner_angle ?? 360;
        let outer_angle = args.outer_angle ?? 360;
        let inner_radius = args.inner_radius ?? 0;
        let outer_radius = args.outer_radius ?? 100;
        let falloff_intensity = args.falloff_intensity ?? 0.234;
        let light_color = args.light_color ?? [1, 1, 1, 1];
        let segments = args.segments ?? 36;
        let translate = args.translate ?? [0, 0];
        let scale = args.scale ?? [1, 1];
        let rotation = args.rotation ?? 0;

        // bind program
        let program = this.context.programs.point_light_program;
        if (program === undefined) {
            program = this._create_point_light_program();
            this.context.programs.point_light_program = program;
        }
        program.use();

        // transform
        gl.uniform4f(program.get_uniform_location('uTransform'), translate[0], translate[1], scale[0], scale[1]);
        gl.uniform1f(program.get_uniform_location('uRotation'), rotation);

        // light info
        gl.uniform4fv(program.get_uniform_location('uLightInfo[0]'), [
            inner_angle, outer_angle, inner_radius, outer_radius,
            falloff_intensity, segments, 0, 0
        ]);

        // light color
        gl.uniform4fv(program.get_uniform_location('uLightColor'), light_color);

        // projection view matrix
        {
            let projection_matrix = this.get_current_state('projection_matrix');
            let view_matrix = this.get_current_state('view_matrix');

            gl.uniformMatrix4fv(
                program.get_uniform_location('uProjectionMatrix'),
                false,
                projection_matrix
            );
            gl.uniformMatrix4fv(
                program.get_uniform_location('uViewMatrix'),
                false,
                view_matrix
            );
        }

        // vertex buffer
        let max_vert_id = Math.ceil(segments * (outer_angle / 360)) + 2;
        let vert_ids = [...Array(max_vert_id).keys()];
        let vert_buffer = this.alloc_dynamic_array_buffer(vert_ids.length);
        vert_buffer.bind();
        for (let i = 0; i < vert_ids.length; ++i) {
            vert_buffer.data[i] = vert_ids[i];
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vert_buffer.data, 0, vert_ids.length * IMR_impl.FLOAT_SIZE);

        const loc = program.get_attrib_location('aVertId');
        gl.vertexAttribPointer(
            loc,
            1,
            gl.FLOAT,
            false,
            IMR_impl.FLOAT_SIZE,
            0
        );
        gl.enableVertexAttribArray(loc);
        vert_buffer.unbind();

        // draw
        gl.drawArrays(gl.TRIANGLE_FAN, 0, vert_ids.length);

        // release
        this.free_dynamic_array_buffer(vert_buffer);
    }

    IMR_impl.prototype._create_point_light_program = function () {
        const vs_source =
            `
                #define PI 3.1415926535897932384626433832795

                attribute vec4 aVertId;

                uniform vec4 uTransform;
                uniform float uRotation;
                uniform vec4 uLightInfo[2];
                uniform mat4 uViewMatrix;
                uniform mat4 uProjectionMatrix;

                varying vec2 vLightDirection;

                void main()
                {
                    float inner_angle = uLightInfo[0].x;
                    float outer_angle = uLightInfo[0].y;
                    float inner_radius = uLightInfo[0].z;
                    float outer_radius = uLightInfo[0].w;
                    float falloff_intensity = uLightInfo[1].x;
                    float segments = uLightInfo[1].y;

                    float vert_id = aVertId.x;
                    vec4 pos;
                    if (vert_id == 0.0) {
                        pos = vec4(0, 0, 0, 1);
                        vLightDirection = pos.xy; 
                    }
                    else {
                        pos = vec4(outer_radius, 0, 0, 1);

                        float vert_angle_step = min(outer_angle * PI / 180.0, (vert_id - 1.0) * 2.0 * PI / segments);

                        // scale
                        pos.xy *= uTransform.zw;

                        // rotation
                        float rotation = uRotation * PI / 180.0 + vert_angle_step;
                        float tmp_x = pos.x;
                        pos.x = pos.x*cos(rotation) - pos.y*sin(rotation);
                        pos.y = tmp_x*sin(rotation) + pos.y*cos(rotation);

                        // varying
                        vLightDirection = normalize(pos.xy);//normalize(pos.xy); 
                    }

                    // transition
                    pos.xy += uTransform.xy;

                    // output
                    gl_Position = uProjectionMatrix * uViewMatrix * pos;
                }
            `;

        const ps_source =
            `
                // android chrome does not support glDrawBuffers extension
                // #extension GL_EXT_draw_buffers : require

                precision highp float;

                uniform vec4 uLightColor;

                varying vec2 vLightDirection;
                varying float vDistanceFromCenter;

                void main()
                {
                    // encode color
                    vec4 col = uLightColor;
                    col.xyz = col.xyz * length(vLightDirection);
                    float r = floor(255.0*col.x);
                    float g = floor(255.0*col.y);
                    float b = floor(255.0*col.z);
                    float a = floor(255.0*col.w);
                    float rg = r * 1000.0 + g;
                    float ba = b * 1000.0 + a;
                    vec2 col_encoded = vec2(rg, ba) / 255.0;
                    // decode color
                    // r = floor(rg / 1000.0);
                    // g = rg - r * 1000.0;
                    // b = floor(ba / 1000.0);
                    // a = ba - b * 1000.0; 

                    // encode dir
                    vec2 dir_encoded = (vLightDirection + 1.0) * 0.5;

                    // output
                    // gl_FragData[0] = vec4(col_encoded, dir_encoded);
                    gl_FragColor = vec4(col_encoded, dir_encoded);
                }
            `;

        const program = new IMRPROGRAM(this.context.gl, vs_source, ps_source);
        return program;
    }

    IMR_impl.prototype.push_viewport = function (x, y, width, height) {
        this.context.viewport_stack = this.context.viewport_stack ?? [];
        this.context.viewport_stack.push([x, y, width, height]);
        this.context.gl.viewport(x, y, width, height);
    }

    IMR_impl.prototype.pop_viewport = function () {
        console.assert(this.context.viewport_stack && this.context.viewport_stack.length);
        this.context.viewport_stack.pop();
        if (this.context.viewport_stack.length >= 1) {
            let v = this.context.viewport_stack[this.context.viewport_stack.length - 1];
            this.context.gl.viewport(v[0], v[1], v[2], v[3]);
        }
    }

    IMR_impl.prototype.get_texture_info = function (texture_name) {
        let texture_info = this.context.textures[texture_name];
        return texture_info;
    }

    return new IMR_impl();
})();
