/*!
betajs-media - v0.0.3 - 2015-11-04
Copyright (c) Oliver Friedmann
MIT Software License.
*/
(function () {

var Scoped = this.subScope();

Scoped.binding("module", "global:BetaJS.Media");
Scoped.binding("base", "global:BetaJS");

Scoped.binding("jquery", "global:jQuery");

Scoped.define("module:", function () {
	return {
		guid: "8475efdb-dd7e-402e-9f50-36c76945a692",
		version: '27.1446660783758'
	};
});

Scoped.define("module:Player.FlashPlayer", [
    "base:Browser.DomExtend.DomExtension",
	"base:Browser.Dom",
	"base:Browser.Info",
    "base:Flash.FlashClassRegistry",
    "base:Flash.FlashEmbedding",
    "base:Strings",
    "base:Async",
    "base:Objs",
    "base:Functions",
    "base:Types",
    "jquery:"    
], function (Class, Dom, Info, FlashClassRegistry, FlashEmbedding, Strings, Async, Objs, Functions, Types, $, scoped) {
	var Cls = Class.extend({scoped: scoped}, function (inherited) {
		return {
			
			constructor: function (element, attrs) {
				inherited.constructor.call(this, element, attrs);
				this._source = this.__preferedSource();
				this._embedding = this.auto_destroy(new FlashEmbedding(element, {
					registry: this.cls.flashRegistry(),
					wrap: true,
					debug: false
				}));
				this._flashObjs = {};
				this._flashData = {
					status: 'idle'
				};
				this._embedding.ready(this.__initializeEmbedding, this);
			},
			
			__preferedSource: function () {
				var preferred = [".mp4", ".flv"];
				var sources = [];
				if (this.readAttr("src")) {
					var src = this.readAttr("src");
					if (Types.is_array(src))
						sources = src;
					else
						sources.push(src);
				}
				var element = this._element;
				if (!(Info.isInternetExplorer() && Info.internetExplorerVersion() < 9)) {
					for (var i = 0; i < this._element.childNodes.length; ++i) {
						if (element.childNodes[i].tagName && element.childNodes[i].tagName.toLowerCase() == "source" && element.childNodes[i].src)
							sources.push(element.childNodes[i].src.toLowerCase());
					}
				} else {
					var $current = this._$element;
					while (true) {
						var $next = $current.next();
						var next = $next.get(0);
						if (!next || next.tagName.toLowerCase() != "source") 
							break;
						sources.push($next.attr("src").toLowerCase());
						$current = $next;
					}
				}
				var source = sources[0];
				var currentExtIndex = preferred.length - 1;
				for (var k = sources.length - 1; k >= 0; --k) {
					for (var j = 0; j <= currentExtIndex; ++j) {
						if (Strings.ends_with(sources[k], preferred[j])) {
							source = sources[k];
							currentExtIndex = j;
							break;
						}
					}
				}
				if (source.indexOf("://") == -1)
					source = document.location.href + "/../" + source;
				
				var connectionUrl = null;
				var playUrl = source;
				if (Strings.starts_with(source, "rtmp")) {
					var spl = Strings.splitLast(source, "/");
					connectionUrl = spl.head;
					playUrl = spl.tail;
				}
				return {
					sourceUrl: source,
					connectionUrl: connectionUrl,
					playUrl: playUrl
				};
			},
			
			__initializeEmbedding: function () {
				this._flashObjs.main = this._embedding.flashMain();
				this._flashObjs.stage = this._flashObjs.main.get("stage");
				this._flashObjs.stage.set("scaleMode", "noScale");
				this._flashObjs.stage.set("align", "TL");
				
				if (this.readAttr("poster")) {
					this._flashObjs.imageLoader = this._embedding.newObject("flash.display.Loader");
					this._flashObjs.imageLoader.get("contentLoaderInfo").addEventListener("complete", this._embedding.newCallback(Functions.as_method(function () {
						this.__imageLoaded = true;
						if (!this.__metaLoaded)
							this.recomputeBB();
					}, this)));
					this._flashObjs.imageUrlRequest = this._embedding.newObject("flash.net.URLRequest", this.readAttr("poster"));
					this._flashObjs.imageLoader.load(this._flashObjs.imageUrlRequest);
					this._flashObjs.main.addChildVoid(this._flashObjs.imageLoader);
				}
				this._flashObjs.video = this._embedding.newObject(
					"flash.media.Video",
					this._flashObjs.stage.get("stageWidth"),
					this._flashObjs.stage.get("stageHeight")
				);
				this._flashObjs.connection = this._embedding.newObject("flash.net.NetConnection");
				this._flashObjs.connection.addEventListener("netStatus", this._embedding.newCallback(Functions.as_method(this.__connectionStatusEvent, this)));
				this._flashObjs.connection.connectVoid(this._source.connectionUrl);
			},
			
			__connectionStatusEvent: function () {
				this._flashObjs.stream = this._embedding.newObject("flash.net.NetStream", this._flashObjs.connection);
				this._flashObjs.stream.set("client", this._embedding.newCallback("onMetaData", Functions.as_method(function (info) {
					this._flashData.meta = info;
					this._element.duration = info.duration;
					this.__metaLoaded = true;
					Async.eventually(this.recomputeBB, this);
				}, this)));
				this._flashObjs.stream.addEventListener("netStatus", this._embedding.newCallback(Functions.as_method(this.__streamStatusEvent, this)));
				this._flashObjs.soundTransform = this._embedding.newObject("flash.media.SoundTransform");
				this._flashObjs.stream.set("soundTransform", this._flashObjs.soundTransform);				
				this._flashObjs.video.attachNetStreamVoid(this._flashObjs.stream);
				this.writeAttr("volume", 1.0);
				if (this.readAttr("muted")) {
					this._flashObjs.soundTransform.set("volume", 0.0);
					this._flashObjs.stream.set("soundTransform", null);				
					this._flashObjs.stream.set("soundTransform", this._flashObjs.soundTransform);
					this.writeAttr("volume", 0.0);
				}
				this._flashObjs.main.addChildVoid(this._flashObjs.video);
				if (this.readAttr("autoplay"))
					this._element.play();
			},
			
			__streamStatusEvent: function (event) {
				var code = event.get("info").code;
				if (code == "NetStream.Play.Start")
					this._flashData.status = "start";
				if (code == "NetStream.Play.Stop")
					this._flashData.status = "stopping";
				if (code == "NetStream.Buffer.Empty" && this._flashData.status == "stopping")
					this._flashData.status = "stopped";
				if (this._flashData.status == "stopped" && this.readAttr("loop")) {
					this._flashData.status = "idle";
					this._element.play();
				}
			},
			
			idealBB: function () {
				if (!this.__imageLoaded && !this.__metaLoaded)
					return null;
				return {
					width: this.__metaLoaded ? this._flashData.meta.width : this._flashObjs.imageLoader.get("width"),
					height: this.__metaLoaded ? this._flashData.meta.height : this._flashObjs.imageLoader.get("height")
				};
			},
			
			setActualBB: function (actualBB) {
				this._$element.find("object").css("width", actualBB.width + "px");
				this._$element.find("embed").css("width", actualBB.width + "px");
				this._$element.find("object").css("height", actualBB.height + "px");
				this._$element.find("embed").css("height", actualBB.height + "px");
				if (this.__metaLoaded) {
					this._flashObjs.video.set("width", actualBB.width);
					this._flashObjs.video.set("height", actualBB.height);
				}
				if (this.__imageLoaded) {
					this._flashObjs.imageLoader.set("width", actualBB.width);
					this._flashObjs.imageLoader.set("height", actualBB.height);
				}
			},
			
			_domMethods: ["play", "pause"],
			
			_domAttrs: {
				"volume": {
					set: "_setVolume"
				},
				"currentTime": {
					get: "_getCurrentTime",
					set: "_setCurrentTime"
				}				
			},
			
			play: function () {
				this._flashObjs.main.setChildIndex(this._flashObjs.video, 1);
				if (this._flashData.status === "paused")
					this._flashObjs.stream.resumeVoid();
				else
					this._flashObjs.stream.playVoid(this._source.playUrl);
			},
			
			pause: function () {
				this._flashObjs.stream.pauseVoid();
				this._flashData.status = "paused";
			},
			
			_setVolume: function (volume) {
				this._flashObjs.soundTransform.set("volume", volume);
				this._flashObjs.stream.set("soundTransform", null);				
				this._flashObjs.stream.set("soundTransform", this._flashObjs.soundTransform);
				this.domEvent("volumechange");
			},
			
			_getCurrentTime: function () {
				return this._flashObjs.stream.get("time");
			},
			
			_setCurrentTime: function (time) {
				this._flashObjs.stream.seek(time);
			}
		
		};		
	}, {
		
		flashRegistry: function () {
			if (!this.__flashRegistry) {
				this.__flashRegistry = new FlashClassRegistry();
				this.__flashRegistry.register("flash.media.Video", ["attachNetStream"]);
				this.__flashRegistry.register("flash.display.Sprite", ["addChild", "setChildIndex"]);
				this.__flashRegistry.register("flash.display.Stage", []);
				this.__flashRegistry.register("flash.net.NetStream", ["play", "pause", "resume", "addEventListener", "seek"]);
				this.__flashRegistry.register("flash.net.NetConnection", ["connect", "addEventListener"]);
				this.__flashRegistry.register("flash.media.SoundTransform", []);
				this.__flashRegistry.register("flash.display.Loader", ["load"]);
				this.__flashRegistry.register("flash.net.URLRequest", []);
				this.__flashRegistry.register("flash.display.LoaderInfo", ["addEventListener"]);
			}
			return this.__flashRegistry;
		},
		
		polyfill: function (element, polyfilltag, force, eventual) {
			if (eventual) {
				Async.eventually(function () {
					Cls.polyfill(element, polyfilltag, force);
				});
				return element; 
			}
			if (element.tagName.toLowerCase() != "video" || !("networkState" in element))
				return Cls.attach(element);
			else if (element.networkState == element.NETWORK_NO_SOURCE || force)
				return Cls.attach(Dom.changeTag(element, polyfilltag || "videopoly"));
			return element;
		},
		
		attach: function (element, attrs) {
			var cls = new Cls(element, attrs);
			return element;
		}
		
		
	});
	return Cls;
});
Scoped.define("module:WebRTC.AudioAnalyser", [
                                              "base:Class",
                                              "module:WebRTC.Support"
                                              ], function (Class, Support, scoped) {
	return Class.extend({scoped: scoped}, function (inherited) {
		return {

			constructor: function (stream) {
				inherited.constructor.call(this);
				var AudioContext = Support.globals().AudioContext;
				this._audioContext = new AudioContext();
				this._analyserNode = Support.globals().createAnalyser.call(this._audioContext);
				this._analyserNode.fftSize = 32;
				this._audioInput = this._audioContext.createMediaStreamSource(stream);
				this._audioInput.connect(this._analyserNode);
			},
			
			destroy: function () {
				this._analyserNode.disconnect();
				delete this._analyserNode;
				delete this._audioContext;
				inherited.destroy.call(this);
			},
				
			soundLevel: function () {
				var bufferLength = this._analyserNode.fftSize;
				var dataArray = new Uint8Array(bufferLength);
				this._analyserNode.getByteTimeDomainData(dataArray);
				var mx = 0.0;
			    for (var i = 0; i < bufferLength; i++)
			        mx = Math.max(mx, Math.abs(dataArray[i] / 128.0));
			    return mx;
			}

		};		
	}, {

		supported: function () {
			return !!Support.globals().AudioContext && !!Support.globals().createAnalyser;
		}

	});
});

// Credits: http://typedarray.org/wp-content/projects/WebAudioRecorder/script.js
// Co-Credits: https://github.com/streamproc/MediaStreamRecorder/blob/master/MediaStreamRecorder-standalone.js

Scoped.define("module:WebRTC.AudioRecorder", [
                                              "base:Class",
                                              "base:Events.EventsMixin",
                                              "base:Objs",
                                              "base:Functions",
                                              "module:WebRTC.Support"
                                              ], function (Class, EventsMixin, Objs, Functions, Support, scoped) {
	return Class.extend({scoped: scoped}, [EventsMixin, function (inherited) {
		return {

			constructor: function (stream, options) {
				inherited.constructor.call(this);
				this._channels = [];
				this._recordingLength = 0;
				this._options = Objs.extend({
					audioChannels: 2,
					bufferSize: 16384,
					sampleRate: 44100				 
				}, options);
				this._stream = stream;
				this._started = false;
				this._stopped = false;
				//this.__initializeContext();
			},

			_audioProcess: function (e) {
				if (!this._started)					
					return;
				/*
				var sampleStartTime = e.playbackTime;
				var sampleStopTime = e.playbackTime + this._actualBufferSize / this._actualSampleRate;
				//var sampleStopTime = e.playbackTime;
				//var sampleStartTime = e.playbackTime - this._actualBufferSize / this._actualSampleRate;
				if (sampleStopTime <= this._startContextTime)
					return;
				if (this._stopped && sampleStartTime > this._stopContextTime) {
					this._started = false;
					this._generateData();
					return;
				}
				*/
				var offset = 0;
				var endOffset = this._actualBufferSize;
				/*
				if (sampleStartTime < this._startContextTime)
					offset = Math.round((this._startContextTime - sampleStartTime) * this._actualSampleRate);
				if (this._stopped && sampleStopTime > this._stopContextTime)
					endOffset = Math.round((this._stopContextTime - sampleStartTime) * this._actualSampleRate);
				*/
				this._channels.push({
					left: new Float32Array(e.inputBuffer.getChannelData(0)),
					right: this._options.audioChannels > 1 ? new Float32Array(e.inputBuffer.getChannelData(1)) : null,
					offset: offset,
					endOffset: endOffset
				});
				this._recordingLength += endOffset - offset;
				/*
				if (this._stopped && sampleStopTime > this._stopContextTime) {
					this._started = false;
					this._generateData();
					return;
				}
				*/
			},

			destroy: function () {
				this.stop();
				//this.__finalizeContext();
				inherited.destroy.call(this);
			},
			
			__initializeContext: function () {
				var AudioContext = Support.globals().AudioContext;
				this._audioContext = new AudioContext();
				this._actualSampleRate = this._audioContext.sampleRate || this._options.sampleRate;
				this._volumeGain = this._audioContext.createGain();
				this._audioInput = this._audioContext.createMediaStreamSource(this._stream);
				this._audioInput.connect(this._volumeGain);
				this._scriptProcessor = Support.globals().audioContextScriptProcessor.call(
						this._audioContext,
						this._options.bufferSize,
						this._options.audioChannels,
						this._options.audioChannels
				);
				this._actualBufferSize = this._scriptProcessor.bufferSize;
				this._scriptProcessor.onaudioprocess = Functions.as_method(this._audioProcess, this);
				this._volumeGain.connect(this._scriptProcessor);
				this._scriptProcessor.connect(this._audioContext.destination);
			},
			
			__finalizeContext: function () {
				this._scriptProcessor.disconnect();
				this._volumeGain.disconnect();
				this._audioInput.disconnect();
				this._scriptProcessor.onaudioprocess = null;
				delete this._scriptProcessor;
				delete this._volumeGain;
				delete this._audioInput;
			},

			start: function () {
				if (this._started)
					return;
				this.__initializeContext();
				this._startContextTime = this._audioContext.currentTime;
				this._started = true;
				this._stopped = false;
				this._recordingLength = 0;
				this._channels = [];
				this.trigger("started");
			},

			stop: function () {
				if (!this._started || this._stopped)
					return;
				this._stopContextTime = this._audioContext.currentTime;
				this._stopped = true;
				this.trigger("stopped");
				this.__finalizeContext();
				this._started = false;
				this._generateData();
			},

			_generateData: function () {
				var interleaved = new Float32Array(this._recordingLength * this._options.audioChannels);
				var offset = 0;
				for (var channelIdx = 0; channelIdx < this._channels.length; ++channelIdx) {
					var channelOffset = this._channels[channelIdx].offset;
					var endOffset = this._channels[channelIdx].endOffset;
					var left = this._channels[channelIdx].left;
					var right = this._channels[channelIdx].right;
					while (channelOffset < endOffset) {
						interleaved[offset] = left[channelOffset];
						if (right) 
							interleaved[offset+1] = right[channelOffset];
						++channelOffset;
						offset += this._options.audioChannels;
					}
				}
				// we create our wav file
				var buffer = new ArrayBuffer(44 + interleaved.length * 2);
				var view = new DataView(buffer);
				// RIFF chunk descriptor
				this.__writeUTFBytes(view, 0, 'RIFF');
				view.setUint32(4, 44 + interleaved.length * 2, true);
				this.__writeUTFBytes(view, 8, 'WAVE');
				// FMT sub-chunk
				this.__writeUTFBytes(view, 12, 'fmt ');
				view.setUint32(16, 16, true);
				view.setUint16(20, 1, true);
				// stereo (2 channels)
				view.setUint16(22, this._options.audioChannels, true);
				view.setUint32(24, this._actualSampleRate, true);
				view.setUint32(28, this._actualSampleRate * 4, true);
				view.setUint16(32, this._options.audioChannels * 2, true);
				view.setUint16(34, 16, true);
				// data sub-chunk
				this.__writeUTFBytes(view, 36, 'data');
				view.setUint32(40, interleaved.length * 2, true);
				// write the PCM samples
				var lng = interleaved.length;
				var index = 44;
				var volume = 1;
				for (var j = 0; j < lng; j++) {
					view.setInt16(index, interleaved[j] * (0x7FFF * volume), true);
					index += 2;
				}
				// our final binary blob
				this._data = new Blob([view], {
					type: 'audio/wav'
				});
				this._leftChannel = [];
				this._rightChannel = [];
				this._recordingLength = 0;
				this.trigger("data", this._data);
			},

			__writeUTFBytes: function (view, offset, string) {
				for (var i = 0; i < string.length; i++)
					view.setUint8(offset + i, string.charCodeAt(i));
			}


		};		
	}], {

		supported: function () {
			return !!Support.globals().AudioContext && !!Support.globals().audioContextScriptProcessor;
		}

	});
});

Scoped.define("module:WebRTC.MediaRecorder", [
    "base:Class",
    "base:Events.EventsMixin",
    "base:Functions",
    "module:WebRTC.Support"
], function (Class, EventsMixin, Functions, Support, scoped) {
	return Class.extend({scoped: scoped}, [EventsMixin, function (inherited) {
		return {
			
			constructor: function (stream) {
				inherited.constructor.call(this);
				this._stream = stream;
				this._started = false;
				var MediaRecorder = Support.globals().MediaRecorder;
				this._mediaRecorder = new MediaRecorder(stream);
				this._mediaRecorder.ondataavailable = Functions.as_method(this._dataAvailable, this);
			},
			
			destroy: function () {
				this.stop();
				inherited.destroy.call(this);
			},
			
			start: function () {
				if (this._started)
					return;
				this._started = true;
				this._mediaRecorder.start();
				this.trigger("started");
			},
			
			stop: function () {
				if (!this._started)
					return;
				this._started = false;
				this._mediaRecorder.stop();
				this.trigger("stopped");
			},
			
			_dataAvailable: function (e) {
				this._data = new Blob([e.data], {
					type: e.data.type
				});
				this.trigger("data", this._data);
			}
						
		};		
	}], {
		
		supported: function () {
			return !!Support.globals().MediaRecorder;
		}
		
	});
});
		

Scoped.define("module:WebRTC.RecorderWrapper", [
    "base:Classes.ConditionalInstance",
    "base:Events.EventsMixin",
    "base:Objs",
    "module:WebRTC.Support",
    "base:Time"
], function (ConditionalInstance, EventsMixin, Objs, Support, Time, scoped) {
	return ConditionalInstance.extend({scoped: scoped}, [EventsMixin, function (inherited) {
		return {
			
			constructor: function (options) {
				inherited.constructor.call(this, options);
				this._video = options.video;
				this._recording = false;
				this._bound = false;
			},
			
			_getConstraints: function () {
				return {
					audio: this._options.recordAudio,
					video: this._options.recordVideo ? {
						/*
						mandatory: {
							minWidth: this._options.recordResolution.width,
							maxWidth: this._options.recordResolution.width,
							minHeight: this._options.recordResolution.height,
							maxHeight: this._options.recordResolution.height
						}
						*/
						width: this._options.recordResolution.width,
						height: this._options.recordResolution.height
					} : false
				};
			},
			
			stream: function () {
				return this._stream;
			},
			
			bindMedia: function () {
				if (this._bound)
					return;
				return Support.userMedia2(this._getConstraints()).success(function (stream) {
					this._bound = true;
					this._stream = stream;
					Support.bindStreamToVideo(stream, this._video);
					this.trigger("bound", stream);
					this._boundMedia();
				}, this);
			},
			
			startRecord: function () {
				if (this._recording)
					return;
				this._recording = true;
				this._startRecord();
				this._startTime = Time.now();
			},
			
			stopRecord: function () {
				if (!this._recording)
					return;
				this._recording = false;
				this._stopRecord();
				this._stopTime = Time.now();
			},
			
			duration: function () {
				return (this._recording ? Time.now() : this._stopTime) - this._startTime;
			},
			
			unbindMedia: function () {
				if (!this._bound || this._recording)
					return;
				Support.stopUserMediaStream(this._stream);
				this._bound = false;
				this.trigger("unbound");
				this._unboundMedia();
			},
			
			createSnapshot: function (type) {
				return Support.dataURItoBlob(this._createSnapshot(type));
			},
			
			_createSnapshot: function (type) {
			    var canvas = document.createElement('canvas');
				canvas.width = this._video.videoWidth || this._video.clientWidth;
				canvas.height = this._video.videoHeight || this._video.clientHeight;
			    var context = canvas.getContext('2d');
	        	context.drawImage(this._video, 0, 0, canvas.width, canvas.height);
	        	var data = canvas.toDataURL(type);
	        	return data;
			},
			
			lightLevel: function (sampleRoot) {
				sampleRoot = sampleRoot || 10;
			    var canvas = document.createElement('canvas');
				canvas.width = this._video.videoWidth || this._video.clientWidth;
				canvas.height = this._video.videoHeight || this._video.clientHeight;
			    var context = canvas.getContext('2d');
	        	context.drawImage(this._video, 0, 0, canvas.width, canvas.height);
	        	var acc = 0.0;
	        	for (var x = 0; x < sampleRoot; ++x)
	        		for (var y = 0; y < sampleRoot; ++y) {
	        			var data = context.getImageData(Math.floor(canvas.width * x / sampleRoot), Math.floor(canvas.height * y / sampleRoot), 1, 1).data;
	        			acc += (data[0] + data[1] + data[2]) / 3; 
	        		}
	        	return acc / sampleRoot / sampleRoot;
			},
			
			_boundMedia: function () {},
			
			_unboundMedia: function () {},
			
			_startRecord: function () {},
			
			_stopRecord: function () {},
			
			_dataAvailable: function (videoBlob, audioBlob) {
				this.trigger("data", videoBlob, audioBlob);
			},
			
			destroy: function () {
				this.stopRecord();
				this.unbindMedia();
				inherited.destroy.call(this);
			}
			
		};
	}], {
		
		_initializeOptions: function (options) {
			return Objs.extend({
				// video: null,
				recordAudio: true,
				recordVideo: true,
				recordResolution: {
					width: 320,
					height: 200
				}
			}, options);
		},
		
		supported: function (options) {
			return !!Support.globals().getUserMedia && !!Support.globals().URL;
		}		
		
	});
});


Scoped.define("module:WebRTC.MediaRecorderWrapper", [
    "module:WebRTC.RecorderWrapper",
    "module:WebRTC.MediaRecorder"
], function (RecorderWrapper, MediaRecorder, scoped) {
	var Cls = RecorderWrapper.extend({scoped: scoped}, {

		_boundMedia: function () {
			this._recorder = new MediaRecorder(this._stream);
			this._recorder.on("data", function (blob) {
				this._dataAvailable(blob);
			}, this);
		},
		
		_unboundMedia: function () {
			this._recorder.destroy();
		},
		
		_startRecord: function () {
			this._recorder.start();
		},
		
		_stopRecord: function () {
			this._recorder.stop();
		}

	}, function (inherited) {
		return {
			
			supported: function (options) {
				if (!inherited.supported.call(this, options))
					return false;
				return MediaRecorder.supported();
			}
		
		};		
	});	
	
	RecorderWrapper.register(Cls, 2);
	
	return Cls;
});


Scoped.define("module:WebRTC.WhammyAudioRecorderWrapper", [
     "module:WebRTC.RecorderWrapper",
     "module:WebRTC.AudioRecorder",
     "module:WebRTC.WhammyRecorder"
], function (RecorderWrapper, AudioRecorder, WhammyRecorder, scoped) {
	var Cls = RecorderWrapper.extend({scoped: scoped}, {
/*
		_getConstraints: function () {
			return {
				audio: this._options.recordAudio,
				video: this._options.recordVideo
			}
		},
*/
		_createSnapshot: function (type) {
			return this._whammyRecorder.createSnapshot(type);
		},

		_boundMedia: function () {
			this._whammyRecorder = new WhammyRecorder(this._stream, {
				//recorderWidth: this._options.recordResolution.width,
				//recorderHeight: this._options.recordResolution.height,
				video: this._video
			});
			this._audioRecorder = new AudioRecorder(this._stream);
			this._audioRecorder.on("data", function (blob) {
				this._audioBlob = blob;
				if (this._videoBlob)
					this._dataAvailable(this._videoBlob, this._audioBlob);
			}, this);
			this._whammyRecorder.on("data", function (blob) {
				this._videoBlob = blob;
				if (this._audioBlob)
					this._dataAvailable(this._videoBlob, this._audioBlob);
			}, this);
			/*
			this._whammyRecorder.on("onStartedDrawingNonBlankFrames", function () {
				if (this._recording)
					this._audioRecorder.start();
			}, this);
			*/
		},
		
		_unboundMedia: function () {
			this._audioRecorder.destroy();
			this._whammyRecorder.destroy();
		},
		
		_startRecord: function () {
			this._whammyRecorder.start();
			this._audioRecorder.start();
		},
		
		_stopRecord: function () {
			this._whammyRecorder.stop();
			this._audioRecorder.stop();
		}		
		
	}, function (inherited) {
		return {
			
			supported: function (options) {
				if (!inherited.supported.call(this, options))
					return false;
				return AudioRecorder.supported() && WhammyRecorder.supported();
			}
		
		};		
	});	
	
	RecorderWrapper.register(Cls, 1);
	
	return Cls;
});

Scoped.define("module:WebRTC.Support", [
    "base:Promise.Promise",
    "base:Objs",
    "base:Browser.Info"
], function (Promise, Objs, Info) {
	return {
		
		canvasSupportsImageFormat: function (imageFormat) {
			try {
				var data = document.createElement('canvas').toDataURL(imageFormat);
				var headerIdx = data.indexOf(";");
				return data.substring(0, data.indexOf(";")).indexOf(imageFormat) != -1;
			} catch (e) {
				return false;
			}
		},
		
		getGlobals: function () {
			var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
			var URL = window.URL || window.webkitURL;
			var MediaRecorder = window.MediaRecorder;
			var AudioContext = window.AudioContext || window.webkitAudioContext;
			var audioContextScriptProcessor = null;
			var createAnalyser = null;
			if (AudioContext) {
				var audioContext = new AudioContext();
				audioContextScriptProcessor = audioContext.createJavaScriptNode || audioContext.createScriptProcessor;
				createAnalyser = audioContext.createAnalyser;
			}
			return {
				getUserMedia: getUserMedia,
				URL: URL,
				MediaRecorder: MediaRecorder,
				AudioContext: AudioContext,
				createAnalyser: createAnalyser,
				audioContextScriptProcessor: audioContextScriptProcessor,
				webpSupport: this.canvasSupportsImageFormat("image/webp") 
			};
		},
		
		globals: function () {
			if (!this.__globals)
				this.__globals = this.getGlobals();
			return this.__globals;
		},
		
		userMediaSupported: function () {
			return !!this.globals().getUserMedia;
		},
		
		mediaStreamTrackSourcesSupported: function () {
			return MediaStreamTrack && MediaStreamTrack.getSources;
		},
		
		mediaStreamTrackSources: function () {
			if (!this.mediaStreamTrackSourcesSupported())
				return Promise.error("Unsupported");
			var promise = new Promise();
			try {
				MediaStreamTrack.getSources(function (sources) {
					var result = {
						audio: {},
						audioCount: 0,
						video: {},
						videoCount: 0
					};
					Objs.iter(sources, function (source) {
						if (source.kind === "video") {
							result.videoCount++;
							result.video[source.id] = {
								id: source.id,
								label: source.label
							};
						}
						if (source.kind === "audio") {
							result.audioCount++;
							result.audio[source.id] = {
								id: source.id,
								label: source.label
							};
						}
					});
					promise.asyncSuccess(result);
				});
				return promise;
			} catch (e) {
				return Promise.error(e);
			}
		},
		
		streamQueryResolution: function (stream) {
			var promise = new Promise();
			var video = this.bindStreamToVideo(stream);			
            video.addEventListener("playing", function () {
                setTimeout(function () {
                	promise.asyncSuccess({
                		stream: stream,
                		width: video.videoWidth,
                		height: video.videoHeight
                	});
                	video.remove();
                }, 500);
            });
			return promise;
		},
		
		userMedia: function (options) {
			var promise = new Promise();
			this.globals().getUserMedia.call(navigator, options, function (stream) {
				promise.asyncSuccess(stream);
			}, function (e) {
				promise.asyncError(e);
			});
			return promise;
		},
		
		/*
		 * audio: {} | undefined
		 * video: {} | undefined
		 * 	  width, height, aspectRatio
		 */
		userMedia2: function (options) {
			var opts = {};
			if (options.audio)
				opts.audio = true;
			if (!options.video)
				return this.userMedia(opts);
			if (Info.isFirefox()) {
				if (options.video) {
					opts.video = {};
					if (options.video.aspectRatio && !(options.video.width && options.video.height)) {
						if (options.video.width)
							options.video.height = Math.round(options.video.width / options.video.aspectRatio);
						else if (options.video.height)
							options.video.width = Math.round(options.video.height * options.video.aspectRatio);
					}
					if (options.video.width) {
						opts.video.width = {
							ideal: options.video.width
						};
					}
					if (options.video.height) {
						opts.video.height = {
							ideal: options.video.height
						};
					}
				}
				return this.userMedia(opts);
			} else {
				if (options.video) {
					opts.video = {
						mandatory: {}
					};
					if (options.video.width) {
						opts.video.mandatory.minWidth = options.video.width;
						opts.video.mandatory.maxWidth = options.video.width;
					}
					if (!options.video.width && options.video.height) {
						opts.video.mandatory.minHeight = options.video.height;
						opts.video.mandatory.maxHeight = options.video.height;
					}
					var as = options.video.aspectRatio ? options.video.aspectRatio : (options.video.width && options.video.height ? options.video.width/options.video.height : null);
					if (as) {
						opts.video.mandatory.minAspectRatio = as;
						opts.video.mandatory.maxAspectRatio = as;
					}
				}
				var probe = function () {
					var mandatory = opts.video.mandatory;
					return this.userMedia(opts).mapError(function (e) {
						if (e.name !== "ConstraintNotSatisfiedError")
							return e;
						var c = e.constraintName;
						var flt = c.indexOf("aspect") > 0;
						var d = c.indexOf("min") === 0 ? -1 : 1;
						var u = Math.max(0, mandatory[c] * (1.0 + d / 10));
						mandatory[c] = flt ? u : Math.round(u);
						return probe.call(this);
					}, this);
				};
				return probe.call(this);
			}
		},
		
		stopUserMediaStream: function (stream) {
			stream.stop();
		},
		
		bindStreamToVideo: function (stream, video) {
			if (!video)
				video = document.createElement("video");
			video.volume = 0;
			video.muted = true;
			if (video.mozSrcObject !== undefined)
                video.mozSrcObject = stream;
            else
            	video.src = this.globals().URL.createObjectURL(stream);
			video.autoplay = true;
			video.play();
			return video;
		},
		
		dataURItoBlob: function (dataURI) {
		    // convert base64 to raw binary data held in a string
		    var byteString = atob(dataURI.split(',')[1]);

		    // separate out the mime component
		    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

		    // write the bytes of the string to an ArrayBuffer
		    var arrayBuffer = new ArrayBuffer(byteString.length);
		    var _ia = new Uint8Array(arrayBuffer);
		    for (var i = 0; i < byteString.length; i++)
		        _ia[i] = byteString.charCodeAt(i);
		    var dataView = new DataView(arrayBuffer);
		    var blob = new Blob([dataView], { type: mimeString });
		    return blob;
		}

	};
});





// Credits: https://github.com/antimatter15/whammy/blob/master/whammy.js
// Co-Credits: https://github.com/streamproc/MediaStreamRecorder/blob/master/MediaStreamRecorder-standalone.js

Scoped.define("module:WebRTC.WhammyRecorder", [
                                              "base:Class",
                                              "base:Events.EventsMixin",
                                              "base:Objs",
                                              "base:Time",
                                              "base:Functions",
                                              "base:Async",
                                              "module:WebRTC.Support"
                                              ], function (Class, EventsMixin, Objs, Time, Functions, Async, Support, scoped) {
	return Class.extend({scoped: scoped}, [EventsMixin, function (inherited) {
		return {

			constructor: function (stream, options) {
				inherited.constructor.call(this);
				this._stream = stream;
				this._options = Objs.extend({
					recordWidth: 320,
					recordHeight: 240,
					video: null
				}, options);
				this._started = false;
			},

			destroy: function () {
				this.stop();
				inherited.destroy.call(this);
			},

			start: function () {
				if (this._started)
					return;
				this._started = true;
			    if (this._options.video) {
			    	this._options.recordWidth = this._options.video.videoWidth || this._options.video.clientWidth;
			    	this._options.recordHeight = this._options.video.videoHeight || this._options.video.clientHeight;
			    }
				this._video = document.createElement('video');
				this._video.width = this._options.recordWidth;
				this._video.height = this._options.recordHeight;
				Support.bindStreamToVideo(this._stream, this._video);
			    this._canvas = document.createElement('canvas');
				this._canvas.width = this._options.recordWidth;
				this._canvas.height = this._options.recordHeight;
	            this._context = this._canvas.getContext('2d');
			    this._frames = [];
			    this._isOnStartedDrawingNonBlankFramesInvoked = false;
			    this._lastTime = Time.now();
				this.trigger("started");
				Async.eventually(this._process, [], this);
			},
			
			stop: function () {
				if (!this._started)
					return;
				this._started = false;
				this.trigger("stopped");
				this._generateData();
			},
			
			_process: function () {
				if (!this._started)
					return;
				var now = Time.now();
				var duration = now - this._lastTime;
		        this._lastTime = now;
	        	this._context.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
			    this._frames.push({
		            duration: duration,
		            image: this._canvas.toDataURL('image/webp')
		        });
		        if (!this._isOnStartedDrawingNonBlankFramesInvoked && !this.__isBlankFrame(this._canvas, this._frames[this._frames.length - 1])) {
		            this._isOnStartedDrawingNonBlankFramesInvoked = true;
		            this.trigger("onStartedDrawingNonBlankFrames");
		        }
		        Async.eventually(this._process, [], this, Math.max(1, 10 - (Time.now() - now)));
			},
			
			_generateData: function () {
		        if (!this._frames.length)
		            return;
		        this._data = this.__compile(this.__dropBlackFrames(this._canvas, this._frames, -1));
		        this.trigger("data", this._data);
			},
			
			clearOldRecordedFrames: function () {
				this._frames = [];
			},
			
			__doubleToString: function (num) {
		        return [].slice.call(
	                new Uint8Array((new Float64Array([num])).buffer), 0).map(function(e) {
	                return String.fromCharCode(e);
	            }).reverse().join('');
			},
			
			__parseRIFF: function (string) {
		        var offset = 0;
		        var chunks = {};

	            var f = function(i) {
	                var unpadded = i.charCodeAt(0).toString(2);
	                return (new Array(8 - unpadded.length + 1)).join('0') + unpadded;
	            }; 

	            while (offset < string.length) {
		            var id = string.substr(offset, 4);
		            var len = parseInt(string.substr(offset + 4, 4).split('').map(f).join(''), 2);
		            var data = string.substr(offset + 4 + 4, len);
		            offset += 4 + 4 + len;
		            chunks[id] = chunks[id] || [];

		            if (id == 'RIFF' || id == 'LIST') {
		                chunks[id].push(this.__parseRIFF(data));
		            } else {
		                chunks[id].push(data);
		            }
		        }
		        return chunks;
		    },
		    
		    __parseWebP: function (riff) {
		        var VP8 = riff.RIFF[0].WEBP[0];

		        var frame_start = VP8.indexOf('\x9d\x01\x2a'); // A VP8 keyframe starts with the 0x9d012a header
		        for (var i = 0, c = []; i < 4; i++) c[i] = VP8.charCodeAt(frame_start + 3 + i);

		        var width, height, tmp;

		        //the code below is literally copied verbatim from the bitstream spec
		        tmp = (c[1] << 8) | c[0];
		        width = tmp & 0x3FFF;
		        tmp = (c[3] << 8) | c[2];
		        height = tmp & 0x3FFF;
		        return {
		            width: width,
		            height: height,
		            data: VP8,
		            riff: riff
		        };
		    },
		    
		    __checkFrames: function (frames) {
		        if (!frames[0])
		            return null;
		        var duration = 0;
		        Objs.iter(frames, function (frame) {
		        	duration += frame.duration;
		        });
		        return {
		            duration: duration,
		            width: frames[0].width,
		            height: frames[0].height
		        };
		    },

		    __makeSimpleBlock: function (data) {
		        var flags = 0;
		        if (data.keyframe) flags |= 128;
		        if (data.invisible) flags |= 8;
		        if (data.lacing) flags |= (data.lacing << 1);
		        if (data.discardable) flags |= 1;
		        if (data.trackNum > 127)
		            throw "TrackNumber > 127 not supported";
		        var out = [data.trackNum | 0x80, data.timecode >> 8, data.timecode & 0xff, flags].map(function(e) {
		            return String.fromCharCode(e);
		        }).join('') + data.frame;
		        return out;
		    },
		    
		    __numToBuffer: function (num) {
		        var parts = [];
		        while (num > 0) {
		            parts.push(num & 0xff);
		            num = num >> 8;
		        }
		        return new Uint8Array(parts.reverse());
		    },

		    __strToBuffer: function (str) {
		        return new Uint8Array(str.split('').map(function(e) {
		            return e.charCodeAt(0);
		        }));
		    },

		    __bitsToBuffer: function (bits) {
		        var data = [];
		        var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
		        bits = pad + bits;
		        for (var i = 0; i < bits.length; i += 8) {
		            data.push(parseInt(bits.substr(i, 8), 2));
		        }
		        return new Uint8Array(data);
		    },
		    
		    __generateEBML: function (json) {
		        var ebml = [];
		        for (var i = 0; i < json.length; i++) {
		            var data = json[i].data;
		            if (typeof data == 'object') data = this.__generateEBML(data);
		            if (typeof data == 'number') data = this.__bitsToBuffer(data.toString(2));
		            if (typeof data == 'string') data = this.__strToBuffer(data);

		            var len = data.size || data.byteLength || data.length;
		            var zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8);
		            var size_str = len.toString(2);
		            var padded = (new Array((zeroes * 7 + 7 + 1) - size_str.length)).join('0') + size_str;
		            var size = (new Array(zeroes)).join('0') + '1' + padded;

		            ebml.push(this.__numToBuffer(json[i].id));
		            ebml.push(this.__bitsToBuffer(size));
		            ebml.push(data);
		        }
		        return new Blob(ebml, {
		            type: "video/webm"
		        });
		    },
		    
		    __toWebM: function (frames) {
		        var info = this.__checkFrames(frames);

		        var CLUSTER_MAX_DURATION = 30000;

		        var EBML = [{
		            "id": 0x1a45dfa3, // EBML
		            "data": [{
		                "data": 1,
		                "id": 0x4286 // EBMLVersion
		            }, {
		                "data": 1,
		                "id": 0x42f7 // EBMLReadVersion
		            }, {
		                "data": 4,
		                "id": 0x42f2 // EBMLMaxIDLength
		            }, {
		                "data": 8,
		                "id": 0x42f3 // EBMLMaxSizeLength
		            }, {
		                "data": "webm",
		                "id": 0x4282 // DocType
		            }, {
		                "data": 2,
		                "id": 0x4287 // DocTypeVersion
		            }, {
		                "data": 2,
		                "id": 0x4285 // DocTypeReadVersion
		            }]
		        }, {
		            "id": 0x18538067, // Segment
		            "data": [{
		                "id": 0x1549a966, // Info
		                "data": [{
		                    "data": 1e6, //do things in millisecs (num of nanosecs for duration scale)
		                    "id": 0x2ad7b1 // TimecodeScale
		                }, {
		                    "data": "whammy",
		                    "id": 0x4d80 // MuxingApp
		                }, {
		                    "data": "whammy",
		                    "id": 0x5741 // WritingApp
		                }, {
		                    "data": this.__doubleToString(info.duration),
		                    "id": 0x4489 // Duration
		                }]
		            }, {
		                "id": 0x1654ae6b, // Tracks
		                "data": [{
		                    "id": 0xae, // TrackEntry
		                    "data": [{
		                        "data": 1,
		                        "id": 0xd7 // TrackNumber
		                    }, {
		                        "data": 1,
		                        "id": 0x63c5 // TrackUID
		                    }, {
		                        "data": 0,
		                        "id": 0x9c // FlagLacing
		                    }, {
		                        "data": "und",
		                        "id": 0x22b59c // Language
		                    }, {
		                        "data": "V_VP8",
		                        "id": 0x86 // CodecID
		                    }, {
		                        "data": "VP8",
		                        "id": 0x258688 // CodecName
		                    }, {
		                        "data": 1,
		                        "id": 0x83 // TrackType
		                    }, {
		                        "id": 0xe0, // Video
		                        "data": [{
		                            "data": info.width,
		                            "id": 0xb0 // PixelWidth
		                        }, {
		                            "data": info.height,
		                            "id": 0xba // PixelHeight
		                        }]
		                    }]
		                }]
		            }]
		        }];

		        //Generate clusters (max duration)
		        var frameNumber = 0;
		        var clusterTimecode = 0;
		        var self = this;
		        var clusterCounter = 0;
		        
		        var f = function(webp) {
                    var block = self.__makeSimpleBlock({
                        discardable: 0,
                        frame: webp.data.slice(4),
                        invisible: 0,
                        keyframe: 1,
                        lacing: 0,
                        trackNum: 1,
                        timecode: Math.round(clusterCounter)
                    });
                    clusterCounter += webp.duration;
                    return {
                        data: block,
                        id: 0xa3
                    };
                };
		        
		        while (frameNumber < frames.length) {

		            var clusterFrames = [];
		            var clusterDuration = 0;
		            do {
		                clusterFrames.push(frames[frameNumber]);
		                clusterDuration += frames[frameNumber].duration;
		                frameNumber++;
		            } while (frameNumber < frames.length && clusterDuration < CLUSTER_MAX_DURATION);

		            clusterCounter = 0;
		            var cluster = {
		                "id": 0x1f43b675, // Cluster
		                "data": [{
		                    "data": clusterTimecode,
		                    "id": 0xe7 // Timecode
		                }].concat(clusterFrames.map(f))
		            }; //Add cluster to segment
		            EBML[1].data.push(cluster);
		            clusterTimecode += clusterDuration;
		        }

		        return this.__generateEBML(EBML);
		    },
		    
		    __compile: function (frames) {
		    	var self = this;
		        var result = this.__toWebM(frames.map(function(frame) {
		            var webp = self.__parseWebP(self.__parseRIFF(atob(frame.image.slice(23))));
		            webp.duration = frame.duration;
		            return webp;
		        }));
		        //return new result;
		        return result;
		    },
		    
		    __dropBlackFrames: function (canvas, _frames, _framesToCheck, _pixTolerance, _frameTolerance) {
		        var localCanvas = document.createElement('canvas');
		        localCanvas.width = canvas.width;
		        localCanvas.height = canvas.height;
		        var context2d = localCanvas.getContext('2d');
		        var resultFrames = [];

		        var checkUntilNotBlack = _framesToCheck === -1;
		        var endCheckFrame = (_framesToCheck && _framesToCheck > 0 && _framesToCheck <= _frames.length) ?
		            _framesToCheck : _frames.length;
		        var sampleColor = {
		            r: 0,
		            g: 0,
		            b: 0
		        };
		        var maxColorDifference = Math.sqrt(
		            Math.pow(255, 2) +
		            Math.pow(255, 2) +
		            Math.pow(255, 2)
		        );
		        var pixTolerance = _pixTolerance && _pixTolerance >= 0 && _pixTolerance <= 1 ? _pixTolerance : 0;
		        var frameTolerance = _frameTolerance && _frameTolerance >= 0 && _frameTolerance <= 1 ? _frameTolerance : 0;
		        var doNotCheckNext = false;

		        for (var f = 0; f < endCheckFrame; f++) {
		            var matchPixCount, endPixCheck, maxPixCount;

		            if (!doNotCheckNext) {
		                var image = new Image();
		                image.src = _frames[f].image;
		                context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
		                var imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);
		                matchPixCount = 0;
		                endPixCheck = imageData.data.length;
		                maxPixCount = imageData.data.length / 4;

		                for (var pix = 0; pix < endPixCheck; pix += 4) {
		                    var currentColor = {
		                        r: imageData.data[pix],
		                        g: imageData.data[pix + 1],
		                        b: imageData.data[pix + 2]
		                    };
		                    var colorDifference = Math.sqrt(
		                        Math.pow(currentColor.r - sampleColor.r, 2) +
		                        Math.pow(currentColor.g - sampleColor.g, 2) +
		                        Math.pow(currentColor.b - sampleColor.b, 2)
		                    );
		                    // difference in color it is difference in color vectors (r1,g1,b1) <=> (r2,g2,b2)
		                    if (colorDifference <= maxColorDifference * pixTolerance) {
		                        matchPixCount++;
		                    }
		                }
		            }

		            if (!doNotCheckNext && maxPixCount - matchPixCount <= maxPixCount * frameTolerance) {
		            } else {
		                if (checkUntilNotBlack) {
		                    doNotCheckNext = true;
		                }
		                resultFrames.push(_frames[f]);
		            }
		        }

		        resultFrames = resultFrames.concat(_frames.slice(endCheckFrame));

		        if (resultFrames.length <= 0) {
		            // at least one last frame should be available for next manipulation
		            // if total duration of all frames will be < 1000 than ffmpeg doesn't work well...
		            resultFrames.push(_frames[_frames.length - 1]);
		        }

		        return resultFrames;
		    },
		    
		    __isBlankFrame: function (canvas, frame, _pixTolerance, _frameTolerance) {
		        var localCanvas = document.createElement('canvas');
		        localCanvas.width = canvas.width;
		        localCanvas.height = canvas.height;
		        var context2d = localCanvas.getContext('2d');

		        var sampleColor = {
		            r: 0,
		            g: 0,
		            b: 0
		        };
		        var maxColorDifference = Math.sqrt(
		            Math.pow(255, 2) +
		            Math.pow(255, 2) +
		            Math.pow(255, 2)
		        );
		        var pixTolerance = _pixTolerance && _pixTolerance >= 0 && _pixTolerance <= 1 ? _pixTolerance : 0;
		        var frameTolerance = _frameTolerance && _frameTolerance >= 0 && _frameTolerance <= 1 ? _frameTolerance : 0;

		        var matchPixCount, endPixCheck, maxPixCount;

		        var image = new Image();
		        image.src = frame.image;
		        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
		        var imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);
		        matchPixCount = 0;
		        endPixCheck = imageData.data.length;
		        maxPixCount = imageData.data.length / 4;

		        for (var pix = 0; pix < endPixCheck; pix += 4) {
		            var currentColor = {
		                r: imageData.data[pix],
		                g: imageData.data[pix + 1],
		                b: imageData.data[pix + 2]
		            };
		            var colorDifference = Math.sqrt(
		                Math.pow(currentColor.r - sampleColor.r, 2) +
		                Math.pow(currentColor.g - sampleColor.g, 2) +
		                Math.pow(currentColor.b - sampleColor.b, 2)
		            );
		            // difference in color it is difference in color vectors (r1,g1,b1) <=> (r2,g2,b2)
		            if (colorDifference <= maxColorDifference * pixTolerance) {
		                matchPixCount++;
		            }
		        }

		        if (maxPixCount - matchPixCount <= maxPixCount * frameTolerance) {
		            return false;
		        } else {
		            return true;
		        }
		    },
			
			createSnapshot: function (type) {
				this._context.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
				return this._canvas.toDataURL(type);
			}

		};		
	}], {

		supported: function () {
			return Support.globals().webpSupport;
		}

	});
});

}).call(Scoped);