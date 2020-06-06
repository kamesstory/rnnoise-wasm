const fs = require("fs");

var Module = (function () {
  var _scriptDir =
    typeof document !== "undefined" && document.currentScript
      ? document.currentScript.src
      : undefined;
  return function (Module) {
    Module = Module || {};

    var Module = typeof Module !== "undefined" ? Module : {};
    var moduleOverrides = {};
    var key;
    for (key in Module) {
      if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key];
      }
    }
    Module["arguments"] = [];
    Module["thisProgram"] = "./this.program";
    Module["quit"] = function (status, toThrow) {
      throw toThrow;
    };
    Module["preRun"] = [];
    Module["postRun"] = [];
    var ENVIRONMENT_IS_WEB = false;
    var ENVIRONMENT_IS_WORKER = false;
    var ENVIRONMENT_IS_NODE = false;
    var ENVIRONMENT_IS_SHELL = false;
    ENVIRONMENT_IS_WEB = typeof window === "object";
    ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
    ENVIRONMENT_IS_NODE =
      typeof process === "object" &&
      typeof require === "function" &&
      !ENVIRONMENT_IS_WEB &&
      !ENVIRONMENT_IS_WORKER;
    ENVIRONMENT_IS_SHELL =
      !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        const fileLocation = Module["locateFile"](path, scriptDirectory);
        console.log(`locatedFile:`, fileLocation);
        return fileLocation;
      } else {
        console.log(`locatedFile:`, scriptDirectory, `+`, path);
        return scriptDirectory + path;
      }
    }
    if (ENVIRONMENT_IS_NODE) {
      console.log(`Environment is node!`);
      scriptDirectory = __dirname + "/";
      var nodeFS;
      var nodePath;
      Module["read"] = function shell_read(filename, binary) {
        var ret;
        if (!nodeFS) nodeFS = require("fs");
        if (!nodePath) nodePath = require("path");
        filename = nodePath["normalize"](filename);
        ret = nodeFS["readFileSync"](filename);
        return binary ? ret : ret.toString();
      };
      Module["readBinary"] = function readBinary(filename) {
        var ret = Module["read"](filename, true);
        if (!ret.buffer) {
          ret = new Uint8Array(ret);
        }
        assert(ret.buffer);
        return ret;
      };
      if (process["argv"].length > 1) {
        Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/");
      }
      Module["arguments"] = process["argv"].slice(2);
      process["on"]("uncaughtException", function (ex) {
        if (!(ex instanceof ExitStatus)) {
          throw ex;
        }
      });
      process["on"]("unhandledRejection", abort);
      Module["quit"] = function (status) {
        process["exit"](status);
      };
      Module["inspect"] = function () {
        return "[Emscripten Module object]";
      };
    } else if (ENVIRONMENT_IS_SHELL) {
      console.log(`Environment is shell!`);
      if (typeof read != "undefined") {
        Module["read"] = function shell_read(f) {
          return read(f);
        };
      }
      Module["readBinary"] = function readBinary(f) {
        var data;
        if (typeof readbuffer === "function") {
          return new Uint8Array(readbuffer(f));
        }
        data = read(f, "binary");
        assert(typeof data === "object");
        return data;
      };
      if (typeof scriptArgs != "undefined") {
        Module["arguments"] = scriptArgs;
      } else if (typeof arguments != "undefined") {
        Module["arguments"] = arguments;
      }
      if (typeof quit === "function") {
        Module["quit"] = function (status) {
          quit(status);
        };
      }
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      console.log(`Environment is web or web worker!`);
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      console.log(`Current script directory:`, scriptDirectory);
      if (_scriptDir) {
        scriptDirectory = _scriptDir;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.lastIndexOf("/") + 1
        );
      } else {
        scriptDirectory = "";
      }
      Module["read"] = function shell_read(url) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText;
      };
      if (ENVIRONMENT_IS_WORKER) {
        Module["readBinary"] = function readBinary(url) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(xhr.response);
        };
      }
      Module["readAsync"] = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function xhr_onload() {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
            onload(xhr.response);
            return;
          }
          onerror();
        };
        xhr.onerror = onerror;
        xhr.send(null);
      };
      Module["setWindowTitle"] = function (title) {
        document.title = title;
      };
    } else {
      console.log(`Environment is none of the above!`);
    }
    var out =
      Module["print"] ||
      (typeof console !== "undefined"
        ? console.log.bind(console)
        : typeof print !== "undefined"
        ? print
        : null);
    var err =
      Module["printErr"] ||
      (typeof printErr !== "undefined"
        ? printErr
        : (typeof console !== "undefined" && console.warn.bind(console)) ||
          out);
    for (key in moduleOverrides) {
      if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key];
      }
    }
    moduleOverrides = undefined;
    var asm2wasmImports = {
      "f64-rem": function (x, y) {
        return x % y;
      },
      debugger: function () {
        debugger;
      },
    };
    var functionPointers = new Array(0);
    if (typeof WebAssembly !== "object") {
      err("no native wasm support detected");
    }
    var wasmMemory;
    var wasmTable;
    var ABORT = false;
    var EXITSTATUS = 0;
    function assert(condition, text) {
      if (!condition) {
        abort("Assertion failed: " + text);
      }
    }
    var UTF8Decoder =
      typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;
    var UTF16Decoder =
      typeof TextDecoder !== "undefined"
        ? new TextDecoder("utf-16le")
        : undefined;
    var WASM_PAGE_SIZE = 65536;
    function alignUp(x, multiple) {
      if (x % multiple > 0) {
        x += multiple - (x % multiple);
      }
      return x;
    }
    var buffer,
      HEAP8,
      HEAPU8,
      HEAP16,
      HEAPU16,
      HEAP32,
      HEAPU32,
      HEAPF32,
      HEAPF64;
    function updateGlobalBufferViews() {
      Module["HEAP8"] = HEAP8 = new Int8Array(buffer);
      Module["HEAP16"] = HEAP16 = new Int16Array(buffer);
      Module["HEAP32"] = HEAP32 = new Int32Array(buffer);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(buffer);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(buffer);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(buffer);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(buffer);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(buffer);
    }
    var DYNAMIC_BASE = 5338208,
      DYNAMICTOP_PTR = 95072;
    var TOTAL_STACK = 5242880;
    var INITIAL_TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
    if (INITIAL_TOTAL_MEMORY < TOTAL_STACK)
      err(
        "TOTAL_MEMORY should be larger than TOTAL_STACK, was " +
          INITIAL_TOTAL_MEMORY +
          "! (TOTAL_STACK=" +
          TOTAL_STACK +
          ")"
      );
    if (Module["buffer"]) {
      buffer = Module["buffer"];
    } else {
      if (
        typeof WebAssembly === "object" &&
        typeof WebAssembly.Memory === "function"
      ) {
        wasmMemory = new WebAssembly.Memory({
          initial: INITIAL_TOTAL_MEMORY / WASM_PAGE_SIZE,
        });
        buffer = wasmMemory.buffer;
      } else {
        buffer = new ArrayBuffer(INITIAL_TOTAL_MEMORY);
      }
    }
    updateGlobalBufferViews();
    HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
    function callRuntimeCallbacks(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
          callback();
          continue;
        }
        var func = callback.func;
        if (typeof func === "number") {
          if (callback.arg === undefined) {
            Module["dynCall_v"](func);
          } else {
            Module["dynCall_vi"](func, callback.arg);
          }
        } else {
          func(callback.arg === undefined ? null : callback.arg);
        }
      }
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATMAIN__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function")
          Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function ensureInitRuntime() {
      if (runtimeInitialized) return;
      runtimeInitialized = true;
      callRuntimeCallbacks(__ATINIT__);
    }
    function preMain() {
      callRuntimeCallbacks(__ATMAIN__);
    }
    function postRun() {
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function")
          Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    Module["preloadedImages"] = {};
    Module["preloadedAudios"] = {};
    var dataURIPrefix = "data:application/octet-stream;base64,";
    function isDataURI(filename) {
      return String.prototype.startsWith
        ? filename.startsWith(dataURIPrefix)
        : filename.indexOf(dataURIPrefix) === 0;
    }
    var wasmBinaryFile = "rnnoise.wasm";
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile);
    }
    if (Module["customWasmFileLoc"]) {
      console.log(`customWasmFileLoc`, Module["customWasmFileLoc"]);
      wasmBinaryFile = Module["customWasmFileLoc"];
    } else {
      throw "Requires customWasmFileLoc!";
    }
    console.log(`final wasmBinaryFile`, wasmBinaryFile);
    function getBinary() {
      try {
        if (Module["wasmBinary"]) {
          return new Uint8Array(Module["wasmBinary"]);
        }
        if (Module["readBinary"]) {
          return Module["readBinary"](wasmBinaryFile);
        } else {
          throw "both async and sync fetching of the wasm failed";
        }
      } catch (err) {
        abort(err);
      }
    }
    function createWasm(env) {
      var info = {
        env: env,
        global: { NaN: NaN, Infinity: Infinity },
        "global.Math": Math,
        asm2wasm: asm2wasmImports,
      };
      function receiveInstance(instance, module) {
        var exports = instance.exports;
        Module["asm"] = exports;
        removeRunDependency("wasm-instantiate");
      }
      addRunDependency("wasm-instantiate");
      if (Module["instantiateWasm"]) {
        try {
          return Module["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err("Module.instantiateWasm callback failed with error: " + e);
          return false;
        }
      }
      function receiveInstantiatedSource(output) {
        receiveInstance(output["instance"]);
      }
      function instantiateArrayBuffer(receiver) {
        console.log(`wasmBinaryFile:`, wasmBinaryFile);
        const buf = fs.readFileSync(wasmBinaryFile).buffer;
        WebAssembly.instantiate(buf, info).then(receiver, function (reason) {
          err("failed to asynchronously prepare wasm: " + reason);
          abort(reason);
        });
      }
      instantiateArrayBuffer(receiveInstantiatedSource);
      return {};
    }
    Module["asm"] = function (global, env, providedBuffer) {
      env["memory"] = wasmMemory;
      env["table"] = wasmTable = new WebAssembly.Table({
        initial: 0,
        maximum: 0,
        element: "anyfunc",
      });
      env["__memory_base"] = 1024;
      env["__table_base"] = 0;
      var exports = createWasm(env);
      return exports;
    };
    function _emscripten_get_heap_size() {
      return HEAP8.length;
    }
    function abortOnCannotGrowMemory(requestedSize) {
      abort("OOM");
    }
    function emscripten_realloc_buffer(size) {
      var PAGE_MULTIPLE = 65536;
      size = alignUp(size, PAGE_MULTIPLE);
      var oldSize = buffer.byteLength;
      try {
        var result = wasmMemory.grow((size - oldSize) / 65536);
        if (result !== (-1 | 0)) {
          return (buffer = wasmMemory.buffer);
        } else {
          return null;
        }
      } catch (e) {
        return null;
      }
    }
    function _emscripten_resize_heap(requestedSize) {
      var oldSize = _emscripten_get_heap_size();
      var PAGE_MULTIPLE = 65536;
      var LIMIT = 2147483648 - PAGE_MULTIPLE;
      if (requestedSize > LIMIT) {
        return false;
      }
      var MIN_TOTAL_MEMORY = 16777216;
      var newSize = Math.max(oldSize, MIN_TOTAL_MEMORY);
      while (newSize < requestedSize) {
        if (newSize <= 536870912) {
          newSize = alignUp(2 * newSize, PAGE_MULTIPLE);
        } else {
          newSize = Math.min(
            alignUp((3 * newSize + 2147483648) / 4, PAGE_MULTIPLE),
            LIMIT
          );
        }
      }
      var replacement = emscripten_realloc_buffer(newSize);
      if (!replacement || replacement.byteLength != newSize) {
        return false;
      }
      updateGlobalBufferViews();
      return true;
    }
    function _llvm_log10_f32(x) {
      return Math.log(x) / Math.LN10;
    }
    function _llvm_log10_f64(a0) {
      return _llvm_log10_f32(a0);
    }
    function _llvm_stackrestore(p) {
      var self = _llvm_stacksave;
      var ret = self.LLVM_SAVEDSTACKS[p];
      self.LLVM_SAVEDSTACKS.splice(p, 1);
      stackRestore(ret);
    }
    function _llvm_stacksave() {
      var self = _llvm_stacksave;
      if (!self.LLVM_SAVEDSTACKS) {
        self.LLVM_SAVEDSTACKS = [];
      }
      self.LLVM_SAVEDSTACKS.push(stackSave());
      return self.LLVM_SAVEDSTACKS.length - 1;
    }
    function _llvm_trap() {
      abort("trap!");
    }
    function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    }
    function ___setErrNo(value) {
      if (Module["___errno_location"])
        HEAP32[Module["___errno_location"]() >> 2] = value;
      return value;
    }
    var asmGlobalArg = {};
    var asmLibraryArg = {
      e: ___setErrNo,
      j: _emscripten_get_heap_size,
      i: _emscripten_memcpy_big,
      h: _emscripten_resize_heap,
      g: _llvm_log10_f64,
      d: _llvm_stackrestore,
      c: _llvm_stacksave,
      b: _llvm_trap,
      f: abortOnCannotGrowMemory,
      a: DYNAMICTOP_PTR,
    };
    var asm = Module["asm"](asmGlobalArg, asmLibraryArg, buffer);
    Module["asm"] = asm;
    var ___errno_location = (Module["___errno_location"] = function () {
      return Module["asm"]["k"].apply(null, arguments);
    });
    var _free = (Module["_free"] = function () {
      return Module["asm"]["l"].apply(null, arguments);
    });
    var _malloc = (Module["_malloc"] = function () {
      return Module["asm"]["m"].apply(null, arguments);
    });
    var _rnnoise_create = (Module["_rnnoise_create"] = function () {
      return Module["asm"]["n"].apply(null, arguments);
    });
    var _rnnoise_destroy = (Module["_rnnoise_destroy"] = function () {
      return Module["asm"]["o"].apply(null, arguments);
    });
    var _rnnoise_init = (Module["_rnnoise_init"] = function () {
      return Module["asm"]["p"].apply(null, arguments);
    });
    var _rnnoise_process_frame = (Module[
      "_rnnoise_process_frame"
    ] = function () {
      return Module["asm"]["q"].apply(null, arguments);
    });
    var stackRestore = (Module["stackRestore"] = function () {
      return Module["asm"]["r"].apply(null, arguments);
    });
    var stackSave = (Module["stackSave"] = function () {
      return Module["asm"]["s"].apply(null, arguments);
    });
    Module["asm"] = asm;
    Module["then"] = function (func) {
      if (Module["calledRun"]) {
        func(Module);
      } else {
        var old = Module["onRuntimeInitialized"];
        Module["onRuntimeInitialized"] = function () {
          if (old) old();
          func(Module);
        };
      }
      return Module;
    };
    function ExitStatus(status) {
      this.name = "ExitStatus";
      this.message = "Program terminated with exit(" + status + ")";
      this.status = status;
    }
    ExitStatus.prototype = new Error();
    ExitStatus.prototype.constructor = ExitStatus;
    dependenciesFulfilled = function runCaller() {
      if (!Module["calledRun"]) run();
      if (!Module["calledRun"]) dependenciesFulfilled = runCaller;
    };
    function run(args) {
      args = args || Module["arguments"];
      if (runDependencies > 0) {
        return;
      }
      preRun();
      if (runDependencies > 0) return;
      if (Module["calledRun"]) return;
      function doRun() {
        if (Module["calledRun"]) return;
        Module["calledRun"] = true;
        if (ABORT) return;
        ensureInitRuntime();
        preMain();
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function () {
          setTimeout(function () {
            Module["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    Module["run"] = run;
    function abort(what) {
      if (Module["onAbort"]) {
        Module["onAbort"](what);
      }
      if (what !== undefined) {
        out(what);
        err(what);
        what = JSON.stringify(what);
      } else {
        what = "";
      }
      ABORT = true;
      EXITSTATUS = 1;
      throw "abort(" + what + "). Build with -s ASSERTIONS=1 for more info.";
    }
    Module["abort"] = abort;
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    Module["noExitRuntime"] = true;
    run();

    return Module;
  };
})();

module.exports = Module;
