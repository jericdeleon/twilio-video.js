'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var RemoteAudioTrack = require('./media/track/remoteaudiotrack');
var RemoteDataTrack = require('./media/track/remotedatatrack');
var RemoteTrackPublication = require('./media/track/remotetrackpublication');
var RemoteVideoTrack = require('./media/track/remotevideotrack');
var EventEmitter = require('events').EventEmitter;
var util = require('./util');

var nInstances = 0;

/**
 * @extends EventEmitter
 * @property {Map<Track.ID, AudioTrack>} audioTracks -
 *    The {@link Participant}'s {@link AudioTrack}s.
 * @property {Map<Track.ID, DataTrack>} dataTracks -
 *    The {@link Participant}'s {@link DataTrack}s.
 * @property {Participant.Identity} identity - The identity of the {@link Participant}
 * @property {Participant.SID} sid - The {@link Participant}'s SID
 * @property {string} state - "connected", "disconnected" or "failed"
 * @property {Map<Track.ID, Track>} tracks -
 *    The {@link Participant}'s {@link Track}s
 * @property {Map<Track.ID, VideoTrack>} videoTracks -
 *    The {@link Participant}'s {@link VideoTrack}s.
 * @emits Participant#disconnected
 * @emits Participant#trackAdded
 * @emits Participant#trackDimensionsChanged
 * @emits Participant#trackDisabled
 * @emits Participant#trackEnabled
 * @emits Participant#trackRemoved
 * @emits Participant#trackStarted
 */

var Participant = function (_EventEmitter) {
  _inherits(Participant, _EventEmitter);

  /**
   * Construct a {@link Participant}.
   * @param {ParticipantSignaling} signaling
   * @param {object} [options]
   */
  function Participant(signaling, options) {
    _classCallCheck(this, Participant);

    var _this = _possibleConstructorReturn(this, (Participant.__proto__ || Object.getPrototypeOf(Participant)).call(this));

    options = Object.assign({
      RemoteAudioTrack: RemoteAudioTrack,
      RemoteVideoTrack: RemoteVideoTrack,
      RemoteDataTrack: RemoteDataTrack,
      tracks: []
    }, options);

    var indexed = indexTracksById(options.tracks);
    var log = options.log.createLog('default', _this);
    var audioTracks = new Map(indexed.audioTracks);
    var dataTracks = new Map(indexed.dataTracks);
    var tracks = new Map(indexed.tracks);
    var videoTracks = new Map(indexed.videoTracks);

    Object.defineProperties(_this, {
      _RemoteAudioTrack: {
        value: options.RemoteAudioTrack
      },
      _RemoteDataTrack: {
        value: options.RemoteDataTrack
      },
      _instanceId: {
        value: ++nInstances
      },
      _log: {
        value: log
      },
      _signaling: {
        value: signaling
      },
      _trackEventReemitters: {
        value: new Map()
      },
      _RemoteVideoTrack: {
        value: options.RemoteVideoTrack
      },
      audioTracks: {
        enumerable: true,
        value: audioTracks
      },
      dataTracks: {
        enumerable: true,
        value: dataTracks
      },
      identity: {
        enumerable: true,
        get: function get() {
          return signaling.identity;
        }
      },
      sid: {
        enumerable: true,
        get: function get() {
          return signaling.sid;
        }
      },
      state: {
        enumerable: true,
        get: function get() {
          return signaling.state;
        }
      },
      tracks: {
        enumerable: true,
        value: tracks
      },
      videoTracks: {
        enumerable: true,
        value: videoTracks
      }
    });

    _this.tracks.forEach(reemitTrackEvents.bind(null, _this));
    reemitSignalingStateChangedEvents(_this, signaling);
    log.info('Created a new Participant' + (_this.identity ? ': ' + _this.identity : ''));
    return _this;
  }

  /**
   * Get the {@link RemoteTrack} events to re-emit.
   * @private
   * @returns {Array<Array<string>>} events
   */


  _createClass(Participant, [{
    key: '_getTrackEvents',
    value: function _getTrackEvents() {
      return [['dimensionsChanged', 'trackDimensionsChanged'], ['disabled', 'trackDisabled'], ['enabled', 'trackEnabled'], ['message', 'trackMessage'], ['started', 'trackStarted']];
    }
  }, {
    key: 'toString',
    value: function toString() {
      return '[Participant #' + this._instanceId + ': ' + this.sid + ']';
    }

    /**
     * @private
     */

  }, {
    key: '_addTrack',
    value: function _addTrack(track) {
      var log = this._log;
      if (this.tracks.has(track.id)) {
        return null;
      }
      this.tracks.set(track.id, track);

      var tracksByKind = {
        audio: this.audioTracks,
        video: this.videoTracks,
        data: this.dataTracks
      }[track.kind];
      tracksByKind.set(track.id, track);
      reemitTrackEvents(this, track);

      log.info('Added a new ' + util.trackClass(track) + ':', track.id);
      log.debug(util.trackClass(track) + ':', track);
      this.emit('trackAdded', track);

      return track;
    }

    /**
     * @private
     */

  }, {
    key: '_handleTrackSignalingEvents',
    value: function _handleTrackSignalingEvents() {
      var log = this._log;
      var self = this;

      if (this.state === 'disconnected') {
        return;
      }

      var RemoteAudioTrack = this._RemoteAudioTrack;
      var RemoteVideoTrack = this._RemoteVideoTrack;
      var RemoteDataTrack = this._RemoteDataTrack;
      var signaling = this._signaling;

      function trackSignalingAdded(signaling) {
        function handleTrackSubscriptionFailed() {
          if (!signaling.error) {
            return;
          }
          signaling.removeListener('updated', handleTrackSubscriptionFailed);
          var remoteTrackPublication = new RemoteTrackPublication(signaling.kind, signaling.sid, signaling.name, { log: log });
          self._log.warn('Failed to subscribe to Remote' + util.capitalize(signaling.kind) + 'Track ' + signaling.sid + ' with name "' + signaling.name + '": ' + signaling.error.message);
          self.emit('trackSubscriptionFailed', signaling.error, remoteTrackPublication);
        }

        signaling.on('updated', handleTrackSubscriptionFailed);

        signaling.getTrackTransceiver().then(function (trackReceiver) {
          signaling.removeListener('updated', handleTrackSubscriptionFailed);

          var RemoteTrack = {
            audio: RemoteAudioTrack,
            video: RemoteVideoTrack,
            data: RemoteDataTrack
          }[signaling.kind];

          // NOTE(mroberts): It should never be the case that the TrackSignaling and
          // MediaStreamTrack or DataTrackReceiver kinds disagree; however, just in
          // case, we handle it here.
          if (!RemoteTrack || signaling.kind !== trackReceiver.kind) {
            return;
          }

          var track = new RemoteTrack(trackReceiver, signaling, { log: log });
          self._addTrack(track);
        });
      }

      function trackSignalingRemoved(signaling) {
        signaling.getTrackTransceiver().then(function () {
          var track = self.tracks.get(signaling.id);
          if (track) {
            self._removeTrack(track);
          }
        });
      }

      signaling.on('trackAdded', trackSignalingAdded);
      signaling.on('trackRemoved', trackSignalingRemoved);

      signaling.tracks.forEach(trackSignalingAdded);

      signaling.on('stateChanged', function stateChanged(state) {
        if (state === 'disconnected') {
          log.debug('Removing TrackSignaling listeners');
          signaling.removeListener('stateChanged', stateChanged);
          signaling.removeListener('trackAdded', trackSignalingAdded);
          signaling.removeListener('trackRemoved', trackSignalingRemoved);
        }
      });
    }

    /**
     * @private
     */

  }, {
    key: '_deleteTrack',
    value: function _deleteTrack(track) {
      this.tracks.delete(track.id);

      var tracksByKind = {
        audio: this.audioTracks,
        video: this.videoTracks,
        data: this.dataTracks
      }[track.kind];
      tracksByKind.delete(track.id);

      var reemitters = this._trackEventReemitters.get(track.id) || new Map();
      reemitters.forEach(function (reemitter, event) {
        track.removeListener(event, reemitter);
      });

      var log = this._log;
      log.info('Removed a ' + util.trackClass(track) + ':', track.id);
      log.debug(util.trackClass(track) + ':', track);
    }

    /**
     * @private
     */

  }, {
    key: '_removeTrack',
    value: function _removeTrack(track) {
      if (!this.tracks.has(track.id)) {
        return null;
      }
      track = this.tracks.get(track.id);
      this._deleteTrack(track);
      this.emit('trackRemoved', track);
      return track;
    }
  }]);

  return Participant;
}(EventEmitter);

/**
 * A {@link Participant.SID} is a 34-character string starting with "PA"
 * that uniquely identifies a {@link Participant}.
 * @type string
 * @typedef Participant.SID
 */

/**
 * A {@link Participant.Identity} is a string that identifies a
 * {@link Participant}. You can think of it like a name.
 * @type string
 * @typedef Participant.Identity
 */

/**
 * The {@link Participant} has disconnected.
 * @param {Participant} participant - The {@link Participant} that disconnected.
 * @event Participant#disconnected
 */

/**
 * A {@link Track} was added by the {@link Participant}.
 * @param {Track} track - The {@link Track} that was added
 * @event Participant#trackAdded
 */

/**
 * One of the {@link Participant}'s {@link VideoTrack}'s dimensions changed.
 * @param {VideoTrack} track - The {@link VideoTrack} whose dimensions changed
 * @event Participant#trackDimensionsChanged
 */

/**
 * A {@link Track} was disabled by the {@link Participant}.
 * @param {Track} track - The {@link Track} that was disabled
 * @event Participant#trackDisabled
 */

/**
 * A {@link Track} was enabled by the {@link Participant}.
 * @param {Track} track - The {@link Track} that was enabled
 * @event Participant#trackEnabled
 */

/**
 * A {@link Track} was removed by the {@link Participant}.
 * @param {Track} track - The {@link Track} that was removed
 * @event Participant#trackRemoved
 */

/**
 * One of the {@link Participant}'s {@link Track}s started.
 * @param {Track} track - The {@link Track} that started
 * @event Participant#trackStarted
 */

/**
 * Indexed {@link Track}s by {@link Track.ID}.
 * @typedef {object} IndexedTracks
 * @property {Array<{0: Track.ID, 1: AudioTrack}>} audioTracks - Indexed
 *   {@link AudioTrack}s
 * @property {Array<{0: Track.ID, 1: DataTrack}>} dataTracks - Indexed
 *   {@link DataTrack}s
 * @property {Array<{0: Track.ID, 1: Track}>} tracks - Indexed {@link Track}s
 * @property {Array<{0: Track.ID, 1: VideoTrack}>} videoTracks - Indexed
 *   {@link VideoTrack}s
 * @private
 */

/**
 * Index tracks by {@link Track.ID}.
 * @param {Array<Track>} tracks
 * @returns {IndexedTracks}
 * @private
 */


function indexTracksById(tracks) {
  var indexedTracks = tracks.map(function (track) {
    return [track.id, track];
  });
  var indexedAudioTracks = indexedTracks.filter(function (keyValue) {
    return keyValue[1].kind === 'audio';
  });
  var indexedVideoTracks = indexedTracks.filter(function (keyValue) {
    return keyValue[1].kind === 'video';
  });
  var indexedDataTracks = indexedTracks.filter(function (keyValue) {
    return keyValue[1].kind === 'data';
  });

  return {
    audioTracks: indexedAudioTracks,
    dataTracks: indexedDataTracks,
    tracks: indexedTracks,
    videoTracks: indexedVideoTracks
  };
}

/**
 * Re-emit {@link ParticipantSignaling} 'stateChanged' events.
 * @param {Participant} participant
 * @param {ParticipantSignaling} signaling
 * @private
 */
function reemitSignalingStateChangedEvents(participant, signaling) {
  var log = participant._log;

  if (participant.state === 'disconnected') {
    return;
  }

  // Reemit state transition events from the ParticipantSignaling.
  signaling.on('stateChanged', function stateChanged(state) {
    log.debug('Transitioned to state:', state);
    participant.emit(state, participant);
    if (state === 'disconnected') {
      log.debug('Removing Track event reemitters');
      signaling.removeListener('stateChanged', stateChanged);

      participant.tracks.forEach(function (track) {
        participant._trackEventReemitters.get(track.id).forEach(function (reemitter, event) {
          track.removeListener(event, reemitter);
        });
      });
      participant._trackEventReemitters.clear();
    }
  });
}

/**
 * Re-emit {@link Track} events.
 * @param {Participant} participant
 * @param {Track} track
 * @private
 */
function reemitTrackEvents(participant, track) {
  var trackEventReemitters = new Map();

  if (participant.state === 'disconnected') {
    return;
  }

  participant._getTrackEvents().forEach(function (eventPair) {
    var trackEvent = eventPair[0];
    var participantEvent = eventPair[1];

    trackEventReemitters.set(trackEvent, function () {
      var args = [participantEvent].concat([].slice.call(arguments));
      return participant.emit.apply(participant, _toConsumableArray(args));
    });

    track.on(trackEvent, trackEventReemitters.get(trackEvent));
  });

  participant._trackEventReemitters.set(track.id, trackEventReemitters);
}

module.exports = Participant;