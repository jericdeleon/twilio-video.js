'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var PeerConnectionV2 = require('./peerconnection');
var MediaTrackSender = require('../../media/track/sender');
var QueueingEventEmitter = require('../../queueingeventemitter');
var util = require('../../util');

var isFirefox = util.guessBrowser() === 'firefox';

/**
 * {@link PeerConnectionManager} manages multiple {@link PeerConnectionV2}s.
 * @extends QueueingEventEmitter
 * @emits PeerConnectionManager#candidates
 * @emits PeerConnectionManager#description
 * @emits PeerConnectionManager#trackAdded
 */

var PeerConnectionManager = function (_QueueingEventEmitter) {
  _inherits(PeerConnectionManager, _QueueingEventEmitter);

  /**
   * Construct {@link PeerConnectionManager}.
   * @param {IceServerSource} iceServerSource
   * @param {EncodingParametersImpl} encodingParameters
   * @param {PreferredCodecs} preferredCodecs
   */
  function PeerConnectionManager(iceServerSource, encodingParameters, preferredCodecs, options) {
    _classCallCheck(this, PeerConnectionManager);

    var _this = _possibleConstructorReturn(this, (PeerConnectionManager.__proto__ || Object.getPrototypeOf(PeerConnectionManager)).call(this));

    options = Object.assign({
      audioContextFactory: isFirefox ? require('../../webaudio/audiocontext') : null,
      PeerConnectionV2: PeerConnectionV2
    }, options);

    var audioContext = options.audioContextFactory ? options.audioContextFactory.getOrCreate(_this) : null;

    // NOTE(mroberts): If we're using an AudioContext, we don't need to specify
    // `offerToReceiveAudio` in RTCOfferOptions.
    var offerOptions = audioContext ? { offerToReceiveVideo: true } : { offerToReceiveAudio: true, offerToReceiveVideo: true };

    Object.defineProperties(_this, {
      _audioContextFactory: {
        value: options.audioContextFactory
      },
      _closedPeerConnectionIds: {
        value: new Set()
      },
      _configuration: {
        writable: true,
        value: null
      },
      _configurationDeferred: {
        writable: true,
        value: util.defer()
      },
      _dummyAudioTrackSender: {
        value: audioContext ? new MediaTrackSender(createDummyAudioMediaStreamTrack(audioContext)) : null
      },
      _encodingParameters: {
        value: encodingParameters
      },
      _iceServerSource: {
        value: iceServerSource
      },
      _dataTrackSenders: {
        writable: true,
        value: new Set()
      },
      _mediaTrackSenders: {
        writable: true,
        value: new Set()
      },
      _offerOptions: {
        value: offerOptions
      },
      _peerConnections: {
        value: new Map()
      },
      _preferredCodecs: {
        value: preferredCodecs
      },
      _PeerConnectionV2: {
        value: options.PeerConnectionV2
      }
    });
    return _this;
  }

  /**
   * Get the {@link PeerConnectionManager}'s configuration.
   * @private
   * @returns {Promise<object>}
   */


  _createClass(PeerConnectionManager, [{
    key: '_getConfiguration',
    value: function _getConfiguration() {
      return this._configurationDeferred.promise;
    }

    /**
     * Get or create a {@link PeerConnectionV2}.
     * @private
     * @param {string} id
     * @param {object} [configuration]
     * @returns {PeerConnectionV2}
     */

  }, {
    key: '_getOrCreate',
    value: function _getOrCreate(id, configuration) {
      var self = this;
      var peerConnection = this._peerConnections.get(id);
      if (!peerConnection) {
        var _PeerConnectionV = this._PeerConnectionV2;

        var options = Object.assign({
          offerOptions: this._offerOptions
        }, configuration);
        peerConnection = new _PeerConnectionV(id, this._encodingParameters, this._preferredCodecs, options);

        this._peerConnections.set(peerConnection.id, peerConnection);
        peerConnection.on('candidates', this.queue.bind(this, 'candidates'));
        peerConnection.on('description', this.queue.bind(this, 'description'));
        peerConnection.on('trackAdded', this.queue.bind(this, 'trackAdded'));
        peerConnection.on('stateChanged', function stateChanged(state) {
          if (state === 'closed') {
            peerConnection.removeListener('stateChanged', stateChanged);
            self._peerConnections.delete(peerConnection.id);
            self._closedPeerConnectionIds.add(peerConnection.id);
          }
        });

        this._dataTrackSenders.forEach(peerConnection.addDataTrackSender, peerConnection);
        this._mediaTrackSenders.forEach(peerConnection.addMediaTrackSender, peerConnection);
      }
      return peerConnection;
    }

    /**
     * Close all the {@link PeerConnectionV2}s in this {@link PeerConnectionManager}.
     * @returns {this}
     */

  }, {
    key: 'close',
    value: function close() {
      if (this._iceServerSource.isStarted) {
        this._iceServerSource.stop();
      }
      this._peerConnections.forEach(function (peerConnection) {
        peerConnection.close();
      });
      if (this._dummyAudioTrackSender) {
        this._dummyAudioTrackSender.track.stop();
      }
      if (this._audioContextFactory) {
        this._audioContextFactory.release(this);
      }
      return this;
    }

    /**
     * Create a new {@link PeerConnectionV2} on this {@link PeerConnectionManager}.
     * Then, create a new offer with the newly-created {@link PeerConnectionV2}.
     * @return {Promise<this>}
     */

  }, {
    key: 'createAndOffer',
    value: function createAndOffer() {
      var _this2 = this;

      return this._getConfiguration().then(function (configuration) {
        var id = void 0;
        do {
          id = util.makeUUID();
        } while (_this2._peerConnections.has(id));

        return _this2._getOrCreate(id, configuration);
      }).then(function (peerConnection) {
        return peerConnection.offer();
      }).then(function () {
        return _this2;
      });
    }

    /**
     * Get the {@link DataTrackReceiver}s and {@link MediaTrackReceiver}s of all
     * the {@link PeerConnectionV2}s.
     * @returns {Array<DataTrackReceiver|MediaTrackReceiver>} trackReceivers
     */

  }, {
    key: 'getTrackReceivers',
    value: function getTrackReceivers() {
      return util.flatMap(this._peerConnections, function (peerConnection) {
        return peerConnection.getTrackReceivers();
      });
    }

    /**
     * Get the states of all {@link PeerConnectionV2}s.
     * @returns {Array<object>}
     */

  }, {
    key: 'getStates',
    value: function getStates() {
      var peerConnectionStates = [];
      this._peerConnections.forEach(function (peerConnection) {
        var peerConnectionState = peerConnection.getState();
        if (peerConnectionState) {
          peerConnectionStates.push(peerConnectionState);
        }
      });
      return peerConnectionStates;
    }

    /**
     * Set the {@link PeerConnectionManager}'s configuration.
     * @param {object} configuration
     * @returns {this}
     */

  }, {
    key: 'setConfiguration',
    value: function setConfiguration(configuration) {
      if (this._configuration) {
        this._configurationDeferred = util.defer();
        this._peerConnections.forEach(function (peerConnection) {
          peerConnection.setConfiguration(configuration);
        });
      }
      this._configuration = configuration;
      this._configurationDeferred.resolve(configuration);
      return this;
    }

    /**
     * Set the {@link DataTrackSender}s and {@link MediaTrackSenders} on the
     * {@link PeerConnectionManager}'s underlying {@link PeerConnectionV2}s.
     * @param {Array<DataTrackSender|MediaTrackSender>} trackSenders
     * @returns {this}
     */

  }, {
    key: 'setTrackSenders',
    value: function setTrackSenders(trackSenders) {
      var dataTrackSenders = new Set(trackSenders.filter(function (trackSender) {
        return trackSender.kind === 'data';
      }));
      var mediaTrackSenders = new Set(trackSenders.filter(function (trackSender) {
        return trackSender.kind === 'audio' || trackSender.kind === 'video';
      }));

      if (this._dummyAudioTrackSender) {
        mediaTrackSenders.add(this._dummyAudioTrackSender);
      }

      var changes = getTrackSenderChanges(this, dataTrackSenders, mediaTrackSenders);
      this._dataTrackSenders = dataTrackSenders;
      this._mediaTrackSenders = mediaTrackSenders;
      applyTrackSenderChanges(this, changes);

      return this;
    }

    /**
     * Update the {@link PeerConnectionManager}.
     * @param {Array<object>} peerConnectionStates
     * @returns {Promise<this>}
     */

  }, {
    key: 'update',
    value: function update(peerConnectionStates) {
      var _this3 = this;

      return this._getConfiguration().then(function (configuration) {
        return Promise.all(peerConnectionStates.map(function (peerConnectionState) {
          if (_this3._closedPeerConnectionIds.has(peerConnectionState.id)) {
            return null;
          }
          var peerConnection = _this3._getOrCreate(peerConnectionState.id, configuration);
          return peerConnection.update(peerConnectionState);
        }));
      }).then(function () {
        return _this3;
      });
    }

    /**
     * Get the {@link PeerConnectionManager}'s media statistics.
     * @returns {Promise.<Array<StatsReport>>}
     */

  }, {
    key: 'getStats',
    value: function getStats() {
      var peerConnections = Array.from(this._peerConnections.values());
      return Promise.all(peerConnections.map(function (peerConnection) {
        return peerConnection.getStats();
      }));
    }
  }]);

  return PeerConnectionManager;
}(QueueingEventEmitter);

/**
 * Create a dummy audio MediaStreamTrack with the given AudioContext.
 * @private
 * @param {AudioContext} audioContext
 * @return {MediaStreamTrack}
 */


function createDummyAudioMediaStreamTrack(audioContext) {
  var mediaStreamDestination = audioContext.createMediaStreamDestination();
  return mediaStreamDestination.stream.getAudioTracks()[0];
}

/**
 * @event {PeerConnectionManager#candidates}
 * @param {object} candidates
 */

/**
 * @event {PeerConnectionManager#description}
 * @param {object} description
 */

/**
 * @event {PeerConnectionManager#trackAdded}
 * @param {MediaStreamTrack|DataTrackReceiver} mediaStreamTrackOrDataTrackReceiver
 */

/**
 * Apply {@link TrackSenderChanges}.
 * @param {PeerConnectionManager} peerConnectionManager
 * @param {TrackSenderChanges} changes
 * @returns {void}
 */
function applyTrackSenderChanges(peerConnectionManager, changes) {
  if (changes.data.add.size || changes.data.remove.size || changes.media.add.size || changes.media.remove.size) {
    peerConnectionManager._peerConnections.forEach(function (peerConnection) {
      changes.data.remove.forEach(peerConnection.removeDataTrackSender, peerConnection);
      changes.media.remove.forEach(peerConnection.removeMediaTrackSender, peerConnection);
      changes.data.add.forEach(peerConnection.addDataTrackSender, peerConnection);
      changes.media.add.forEach(peerConnection.addMediaTrackSender, peerConnection);
      peerConnection.offer();
    });
  }
}

/**
 * @interface DataTrackSenderChanges
 * @property {Set<DataTrackSender>} add
 * @property {Set<DataTrackSender>} remove
 */

/**
 * Get the {@Link DataTrackSender} changes.
 * @param {PeerConnectionManager} peerConnectionManager
 * @param {Array<DataTrackSender>} dataTrackSenders
 * @returns {DataTrackSenderChanges} changes
 */
function getDataTrackSenderChanges(peerConnectionManager, dataTrackSenders) {
  var dataTrackSendersToAdd = util.difference(dataTrackSenders, peerConnectionManager._dataTrackSenders);
  var dataTrackSendersToRemove = util.difference(peerConnectionManager._dataTrackSenders, dataTrackSenders);
  return {
    add: dataTrackSendersToAdd,
    remove: dataTrackSendersToRemove
  };
}

/**
 * @interface TrackSenderChanges
 * @property {DataTrackSenderChanges} data
 * @property {MediaTrackSenderChanges} media
 */

/**
 * Get {@link DataTrackSender} and {@link MediaTrackSender} changes.
 * @param {PeerConnectionManager} peerConnectionManager
 * @param {Array<DataTrackSender>} dataTrackSenders
 * @param {Array<MediaTrackSender>} mediaTrackSenders
 * @returns {TrackSenderChanges} changes
 */
function getTrackSenderChanges(peerConnectionManager, dataTrackSenders, mediaTrackSenders) {
  return {
    data: getDataTrackSenderChanges(peerConnectionManager, dataTrackSenders),
    media: getMediaTrackSenderChanges(peerConnectionManager, mediaTrackSenders)
  };
}

/**
 * @interface MediaTrackSenderChanges
 * @property {Set<MediaTrackSender>} add
 * @property {Set<MediaTrackSender>} remove
 */

/**
 * Get the {@link MediaTrackSender} changes.
 * @param {PeerConnectionManager} peerConnectionManager
 * @param {Array<MediaTrackSender>} mediaTrackSenders
 * @returns {MediaTrackSenderChanges} changes
 */
function getMediaTrackSenderChanges(peerConnectionManager, mediaTrackSenders) {
  var mediaTrackSendersToAdd = util.difference(mediaTrackSenders, peerConnectionManager._mediaTrackSenders);
  var mediaTrackSendersToRemove = util.difference(peerConnectionManager._mediaTrackSenders, mediaTrackSenders);
  return {
    add: mediaTrackSendersToAdd,
    remove: mediaTrackSendersToRemove
  };
}

module.exports = PeerConnectionManager;