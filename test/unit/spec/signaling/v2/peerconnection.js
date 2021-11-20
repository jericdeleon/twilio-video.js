/* eslint-disable require-atomic-updates */
/* eslint-disable no-undefined */
'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const sinon = require('sinon');

const EventTarget = require('../../../../../lib/eventtarget');
const IceConnectionMonitor = require('../../../../../lib/signaling/v2/iceconnectionmonitor.js');
const PeerConnectionV2 = require('../../../../../lib/signaling/v2/peerconnection');
const { MediaClientLocalDescFailedError } = require('../../../../../lib/util/twilio-video-errors');
const { FakeMediaStreamTrack } = require('../../../../lib/fakemediastream');
const { a, combinationContext, makeEncodingParameters, waitForSometime } = require('../../../../lib/util');
const { defer } = require('../../../../../lib/util');

describe('PeerConnectionV2', () => {
  let didStartMonitor;
  let didStopMonitor;
  let inactiveCallback;
  beforeEach(() => {
    // stub out IceConnectionMonitor to not have any side effects
    didStartMonitor = false;
    didStopMonitor = false;
    inactiveCallback = null;
    sinon.stub(IceConnectionMonitor.prototype, 'start').callsFake(callback => {
      inactiveCallback = callback;
      didStartMonitor = true;
    });

    sinon.stub(IceConnectionMonitor.prototype, 'stop').callsFake(() => {
      didStopMonitor = true;
    });
  });
  afterEach(() => {
    IceConnectionMonitor.prototype.start.restore();
    IceConnectionMonitor.prototype.stop.restore();
  });

  // describe('constructor', () => {
  //   let test;

  //   beforeEach(() => {
  //     test = makeTest();
  //   });

  //   it('sets .id', () => {
  //     assert.equal(test.pcv2.id, test.id);
  //   });
  // });

  // describe('.connectionState', () => {
  //   it('equals the underlying RTCPeerConnection\'s .connectionState', () => {
  //     const test = makeTest();
  //     test.pc.connectionState = 'connected';
  //     assert.equal(test.pcv2.connectionState, 'connected');
  //   });

  //   it('equals "failed" when IceConnectionMonitor detects failures, also emits "connectionStateChanged"', async () => {
  //     const test = makeTest();

  //     // simulate connect
  //     test.pc.connectionState = 'connected';
  //     test.pc.iceConnectionState = 'connected';
  //     test.pc.emit('iceconnectionstatechange');
  //     test.pc.emit('connectionstatechange');

  //     await oneTick();

  //     let didEmit = false;
  //     test.pcv2.once('connectionStateChanged', () => { didEmit = true; });
  //     inactiveCallback(); // invoke inactive call back.
  //     assert.equal(didEmit, true);

  //     await oneTick();
  //     // simulate disconnect
  //     test.pc.iceConnectionState = 'disconnected';
  //     test.pc.emit('iceconnectionstatechange');
  //     assert.equal(test.pcv2.connectionState, 'failed');
  //   });
  // });

  // describe('._updateEncodings', () => {
  //   [
  //     {
  //       testName: 'resolution >= 960x540',
  //       width: 960,
  //       height: 540,
  //       encodings: [{}, {}, {}],
  //       expectedEncodings: [{ active: true, scaleResolutionDownBy: 4 }, { active: true, scaleResolutionDownBy: 2 }, { active: true, scaleResolutionDownBy: 1 }]
  //     },
  //     {
  //       testName: 'resolution >= 960x540 (no simulcast)',
  //       width: 960,
  //       height: 540,
  //       encodings: [{}],
  //       expectedEncodings: [{ active: true, scaleResolutionDownBy: 1 }]
  //     },
  //     {
  //       testName: '960x540 > resolution >= 480x270',
  //       width: 480,
  //       height: 270,
  //       encodings: [{}, {}, {}],
  //       expectedEncodings: [{ active: true, scaleResolutionDownBy: 2 }, { active: true, scaleResolutionDownBy: 1 }, { active: false }]
  //     },
  //     {
  //       testName: '960x540 > resolution >= 480x270 (no simulcast)',
  //       width: 480,
  //       height: 270,
  //       encodings: [{}], // input encodings has only one layer
  //       expectedEncodings: [{ active: true, scaleResolutionDownBy: 1 }]
  //     },
  //     {
  //       testName: 'resolution <= 480x270',
  //       width: 320,
  //       height: 180,
  //       encodings: [{}, {}, {}],
  //       expectedEncodings: [{ active: true, scaleResolutionDownBy: 1 }, { active: false }, { active: false }]
  //     }
  //   ].forEach(({ width, height, encodings, expectedEncodings, testName }) => {
  //     it(testName, () => {
  //       const test = makeTest();
  //       test.pcv2._updateEncodings(width, height, encodings);
  //       assert.deepStrictEqual(encodings, expectedEncodings);
  //     });
  //   });
  // });

  // describe('.iceConnectionState', () => {
  //   it('equals the underlying RTCPeerConnection\'s .iceConnectionState', () => {
  //     const test = makeTest();
  //     assert.equal(test.pcv2.iceConnectionState, test.pc.iceConnectionState);
  //     test.pc.iceConnectionState = 'failed';
  //     assert.equal(test.pcv2.iceConnectionState, 'failed');
  //   });

  //   it('equals "failed" when IceConnectionMonitor detects failures, also emits "iceConnectionStateChanged"', async () => {
  //     const test = makeTest();
  //     assert.equal(test.pcv2.iceConnectionState, test.pc.iceConnectionState);

  //     // simulate connect.
  //     test.pc.iceConnectionState = 'connected';
  //     test.pc.emit('iceconnectionstatechange');

  //     await oneTick();

  //     inactiveCallback(); // invoke inactive call back.

  //     let didEmit = false;
  //     test.pcv2.once('iceConnectionStateChanged', () => { didEmit = true; });

  //     // simulate disconnect.
  //     test.pc.iceConnectionState = 'disconnected';
  //     test.pc.emit('iceconnectionstatechange');

  //     assert.equal(test.pcv2.iceConnectionState, 'failed');
  //     assert.equal(didEmit, true);
  //     await oneTick();
  //     assert.equal(test.pcv2.iceConnectionState, 'failed');
  //   });
  // });

  // describe('.isApplicationSectionNegotiated', () => {
  //   context('when the underlying RTCPeerConnection has a local RTCSessionDescription', () => {
  //     [true, false].forEach(hasApplicationSection => {
  //       context(`when the RTCSessionDescription ${hasApplicationSection ? 'has' : 'does not have'} an application m= section`, () => {
  //         it(`should be set to ${hasApplicationSection}`, async () => {
  //           const test = makeTest({
  //             offers: [
  //               makeOffer({ application: hasApplicationSection })
  //             ]
  //           });
  //           await test.pcv2.offer();
  //           assert.equal(test.pcv2.isApplicationSectionNegotiated, hasApplicationSection);
  //         });
  //       });
  //     });
  //   });
  //   context('when the underlying RTCPeerConnection does not have a local RTCSessionDescription', () => {
  //     it('should be set to false', () => {
  //       const test = makeTest();
  //       assert.equal(test.pcv2.isApplicationSectionNegotiated, false);
  //     });
  //   });
  // });

  // describe('"connectionStateChanged"', () => {
  //   it('emits "connectionStateChanged" when the underlying RTCPeerConnection emits "connectionstatechange"', () => {
  //     const test = makeTest();
  //     let didEmit = false;
  //     test.pcv2.once('connectionStateChanged', () => { didEmit = true; });
  //     test.pc.emit('connectionstatechange');
  //     assert(didEmit);
  //   });
  // });

  // describe('"iceConnectionStateChanged"', () => {
  //   it('emits "iceConnectionStateChanged" when the underlying RTCPeerConnection emits "iceconnectionstatechange"', () => {
  //     const test = makeTest();
  //     let didEmit = false;
  //     test.pcv2.once('iceConnectionStateChanged', () => { didEmit = true; });
  //     test.pc.emit('iceconnectionstatechange');
  //     assert(didEmit);
  //   });

  //   it('starts IceConnectionMonitor on connected', () => {
  //     const test = makeTest();
  //     assert(!didStartMonitor);
  //     assert(!didStopMonitor);
  //     assert(inactiveCallback === null);

  //     // simulate connection.
  //     test.pc.iceConnectionState = 'connected';
  //     test.pc.emit('iceconnectionstatechange');
  //     assert(didStartMonitor);
  //     assert(!didStopMonitor);
  //     assert(typeof inactiveCallback === 'function');

  //     // simulate failed.
  //     test.pc.iceConnectionState = 'failed';
  //     test.pc.emit('iceconnectionstatechange');
  //     assert(didStartMonitor);
  //     assert(didStopMonitor);
  //   });

  //   it('restarts ice', () => {
  //     const test = makeTest();
  //     assert(!didStartMonitor);
  //     assert(!didStopMonitor);

  //     // simulate connection.
  //     test.pc.iceConnectionState = 'connected';
  //     test.pc.emit('iceconnectionstatechange');
  //     assert(didStartMonitor);
  //     assert(!didStopMonitor);
  //     assert(typeof inactiveCallback === 'function');

  //     // simulate failed.
  //     test.pc.iceConnectionState = 'failed';
  //     test.pc.emit('iceconnectionstatechange');
  //     assert(didStartMonitor);
  //     assert(didStopMonitor);
  //   });
  // });

  // describe('#addDataTrackSender, called with a DataTrackSender that has', () => {
  //   let test;
  //   let dataTrackSender;

  //   beforeEach(() => {
  //     test = makeTest();
  //     dataTrackSender = makeDataTrackSender();
  //   });

  //   describe('never been added', () => {
  //     describe('calls createDataChannel on the underlying RTCPeerConnection, and,', () => {
  //       let result;

  //       describe('if that call succeeds,', () => {
  //         beforeEach(() => {
  //           test.pc.createDataChannel = sinon.spy(test.pc.createDataChannel.bind(test.pc));
  //           result = test.pcv2.addDataTrackSender(dataTrackSender);
  //           sinon.assert.calledOnce(test.pc.createDataChannel);
  //           assert.deepEqual(test.pc.createDataChannel.args[0][1], {
  //             maxPacketLifeTime: dataTrackSender.maxPacketLifeTime,
  //             maxRetransmits: dataTrackSender.maxRetransmits,
  //             ordered: dataTrackSender.ordered
  //           });
  //         });

  //         it('calls addDataChannel on the DataTrackSender with the resulting RTCDataChannel', () => {
  //           sinon.assert.calledOnce(dataTrackSender.addDataChannel);
  //           sinon.assert.calledWith(dataTrackSender.addDataChannel, test.pc.dataChannels[0]);
  //         });

  //         it('returns undefined', () => {
  //           assert.equal(result, undefined);
  //         });
  //       });

  //       describe('if that call fails,', () => {
  //         beforeEach(() => {
  //           test.pc.createDataChannel = () => { throw new Error(); };
  //           result = test.pcv2.addDataTrackSender(dataTrackSender);
  //         });

  //         it('returns undefined', () => {
  //           assert.equal(result, undefined);
  //         });
  //       });
  //     });
  //   });

  //   describe('already been added', () => {
  //     let result;

  //     beforeEach(() => {
  //       test.pcv2.addDataTrackSender(dataTrackSender);

  //       test.pc.createDataChannel = sinon.spy(test.pc.createDataChannel.bind(test.pc));
  //       result = test.pcv2.addDataTrackSender(dataTrackSender);
  //     });

  //     it('does not call createDataChannel on the underlying RTCPeerConnection', () => {
  //       sinon.assert.notCalled(test.pc.createDataChannel);
  //     });

  //     it('returns undefined', () => {
  //       assert.equal(result, undefined);
  //     });
  //   });

  //   describe('been removed', () => {
  //     let result;

  //     beforeEach(() => {
  //       test.pcv2.addDataTrackSender(dataTrackSender);
  //       test.pcv2.removeDataTrackSender(dataTrackSender);
  //       dataTrackSender.addDataChannel.reset();
  //     });

  //     describe('calls createDataChannel on the underlying RTCPeerConnection, and,', () => {
  //       describe('if that call succeeds,', () => {
  //         beforeEach(() => {
  //           test.pc.createDataChannel = sinon.spy(test.pc.createDataChannel.bind(test.pc));
  //           result = test.pcv2.addDataTrackSender(dataTrackSender);
  //           sinon.assert.calledOnce(test.pc.createDataChannel);
  //           sinon.assert.calledWith(test.pc.createDataChannel, dataTrackSender.id);
  //         });

  //         it('calls addDataChannel on the DataTrackSender with the resulting RTCDataChannel', () => {
  //           sinon.assert.calledOnce(dataTrackSender.addDataChannel);
  //           sinon.assert.calledWith(dataTrackSender.addDataChannel, test.pc.dataChannels[1]);
  //         });

  //         it('returns undefined', () => {
  //           assert.equal(result, undefined);
  //         });
  //       });

  //       describe('if that call fails,', () => {
  //         beforeEach(() => {
  //           test.pc.createDataChannel = () => { throw new Error(); };
  //           result = test.pcv2.addDataTrackSender(dataTrackSender);
  //         });

  //         it('returns undefined', () => {
  //           assert.equal(result, undefined);
  //         });
  //       });
  //     });
  //   });
  // });

  // describe('#addMediaTrackSender, called with a MediaTrackSender that has', () => {
  //   let test;
  //   let stream;
  //   let result;

  //   [
  //     ['never been added', () => {}],
  //     ['been added', (test, trackSender) => {
  //       test.pcv2.addMediaTrackSender(trackSender);
  //     }],
  //     ['been removed', (test, trackSender) => {
  //       test.pcv2.addMediaTrackSender(trackSender);
  //       test.pcv2.removeMediaTrackSender(trackSender);
  //     }]
  //   ].forEach(([scenario, setup]) => {
  //     context(scenario, () => {
  //       beforeEach(() => {
  //         test = makeTest();
  //         const track = { id: 1 };
  //         const tracks = [track];
  //         stream = { getTracks() { return tracks; } };
  //         const trackSender = makeMediaTrackSender(track);
  //         setup(test, trackSender);
  //         test.pc.addTransceiver = sinon.spy(() => ({ sender: { track }}));
  //         result = test.pcv2.addMediaTrackSender(trackSender);
  //       });

  //       it('returns undefined', () => {
  //         assert(!result);
  //       });

  //       if (scenario === 'been added') {
  //         it('does not call addTransceiver on the underlying RTCPeerConnection', () => {
  //           sinon.assert.notCalled(test.pc.addTransceiver);
  //         });
  //         return;
  //       }

  //       it('calls addTransceiver on the underlying RTCPeerConnection', () => {
  //         sinon.assert.calledWith(test.pc.addTransceiver, stream.getTracks()[0]);
  //       });
  //     });
  //   });
  // });

  // describe('_setPublisherHint', () => {
  //   let test;
  //   combinationContext([
  //     [
  //       ['stable', 'have-local-offer', 'closed'],
  //       x => `in signalingState "${x}"`
  //     ],
  //     [
  //       [true, false],
  //       x => `When a publisher hint was previously ${x ? '' : 'not '} queued`
  //     ],
  //     [
  //       [true, false],
  //       x => `When a rtpSender.setParameters ${x ? 'resolves' : 'rejects'}`
  //     ]
  //   ], ([signalingState, hasQueuedHint, setParameterSuccess]) => {

  //     let trackSender;
  //     let deferred;
  //     beforeEach(async () => {
  //       test = makeTest({ offers: 1 });

  //       switch (signalingState) {
  //         case 'closed':
  //           test.pcv2.close();
  //           break;
  //         case 'stable':
  //           break;
  //         case 'have-local-offer':
  //           await test.pcv2.offer();
  //           break;
  //       }

  //       const tracks = [{ id: 1 }];
  //       trackSender = makeMediaTrackSender(tracks[0]);
  //       test.pcv2.addMediaTrackSender(trackSender);

  //       if (hasQueuedHint) {
  //         deferred = defer();
  //         test.pcv2._mediaTrackSenderToPublisherHints.set(trackSender, {
  //           encodings: makePublisherHints(1, true),
  //           deferred
  //         });
  //       }
  //     });

  //     if (deferred) {
  //       it('resolves stale hint promise with "REQUEST_SKIPPED"', async () => {
  //         test.pcv2._setPublisherHint(trackSender, makePublisherHints(0, true));
  //         const result = await deferred.promise;
  //         assert(result, 'REQUEST_SKIPPED');
  //       });
  //     }
  //     if (signalingState === 'closed') {
  //       it('returns a promise that resolves to "COULD_NOT_APPLY_HINT"', async () => {
  //         // eslint-disable-next-line camelcase
  //         const result = await test.pcv2._setPublisherHint(trackSender, makePublisherHints(0, true));
  //         assert(result, 'COULD_NOT_APPLY_HINT');
  //       });
  //     }

  //     it('for a unknown track sender resolves to "UNKNOWN_TRACK"', async () => {
  //       const unknownTrackSender = {};
  //       const result  = await test.pcv2._setPublisherHint(unknownTrackSender, makePublisherHints(0, true));
  //       assert(result, 'UNKNOWN_TRACK');
  //     });

  //     if (signalingState === 'have-local-offer') {
  //       it('queues the hint for later processing', done => {
  //         const resultPromise = test.pcv2._setPublisherHint(trackSender, makePublisherHints(0, true));
  //         const queued = test.pcv2._mediaTrackSenderToPublisherHints.get(trackSender);
  //         assert.deepEqual(queued.encodings, makePublisherHints(0, true));

  //         resultPromise.then(result => {
  //           assert(result, 'whatever');
  //           done();
  //         });

  //         queued.deferred.resolve('whatever');
  //       });
  //     }
  //     if (signalingState === 'stable') {
  //       it('applies given encodings', () => {
  //         test.pcv2._setPublisherHint(trackSender, makePublisherHints(0, true));
  //         const rtpSender = test.pcv2._rtpSenders.get(trackSender);
  //         sinon.assert.calledWith(rtpSender.setParameters, sinon.match(parameters => {
  //           return parameters.encodings[0].active === true;
  //         }));
  //       });

  //       let expectedResult = setParameterSuccess ? 'OK' : 'COULD_NOT_APPLY_HINT';
  //       it(`resolves to ${expectedResult}`, async () => {
  //         test.pc.getSenders().forEach(sender => {
  //           sender.setParameters = sinon.spy(() =>
  //             setParameterSuccess ? Promise.resolve('good result') : Promise.reject('bad error')
  //           );
  //         });
  //         const result = await test.pcv2._setPublisherHint(trackSender, makePublisherHints(0, true));
  //         assert.strictEqual(result, expectedResult);
  //       });
  //     }
  //   });
  // });

  // describe('_handleQueuedPublisherHints', () => {
  //   let test;
  //   let trackSender;
  //   let deferred;

  //   beforeEach(() => {
  //     test = makeTest({ offers: 1 });
  //     const tracks = [{ id: 1 }];
  //     trackSender = makeMediaTrackSender(tracks[0]);
  //     test.pcv2.addMediaTrackSender(trackSender);

  //     deferred = defer();
  //     test.pcv2._mediaTrackSenderToPublisherHints.set(trackSender, {
  //       encodings: makePublisherHints(0, false),
  //       deferred
  //     });

  //     test.pcv2._handleQueuedPublisherHints();
  //   });

  //   it('processes queued hints', async () => {
  //     const result = await deferred.promise;
  //     assert(result, 'OK');

  //     const rtpSender = test.pcv2._rtpSenders.get(trackSender);
  //     sinon.assert.calledWith(rtpSender.setParameters, sinon.match(parameters => {
  //       return parameters.encodings[0].active === false;
  //     }));
  //     assert.strictEqual(test.pcv2._mediaTrackSenderToPublisherHints.size, 0);
  //   });
  // });

  // describe('#close', () => {
  //   ['closed', 'stable', 'have-local-offer'].forEach(signalingState => {
  //     let test;
  //     let before;
  //     let result;
  //     let description;
  //     const revision = signalingState === 'have-local-offer' ? 2 : 1;

  //     context(`in signaling state ${signalingState}`, () => {
  //       beforeEach(async () => {
  //         test = makeTest({ offers: 1 });

  //         switch (signalingState) {
  //           case 'closed':
  //             test.pcv2.close();
  //             break;
  //           case 'stable':
  //             break;
  //           case 'have-local-offer':
  //             await test.pcv2.offer();
  //             break;
  //         }

  //         const nextDescription = new Promise(resolve => test.pcv2.once('description', resolve));

  //         test.pc.close = sinon.spy(test.pc.close);
  //         before = test.pcv2.getState();
  //         result = test.pcv2.close();

  //         if (signalingState !== 'closed') {
  //           description = await nextDescription;
  //         }
  //       });

  //       it('returns undefined', () => {
  //         assert(!result);
  //       });

  //       if (signalingState === 'closed') {
  //         it('does not call close on the underlying RTCPeerConnection', () => {
  //           sinon.assert.notCalled(test.pc.close);
  //         });

  //         it('does not update the state', () => {
  //           assert.deepEqual(test.pcv2.getState(), before);
  //         });
  //         it('removes the "changed" event listener on the underlying EncodingParameters', () => {
  //           const listenerCount = test.pcv2._encodingParameters.listenerCount('changed');
  //           assert.strictEqual(listenerCount, 0);
  //         });
  //       } else {
  //         it('calls close on the underlying RTCPeerConnection', () => {
  //           sinon.assert.calledOnce(test.pc.close);
  //         });

  //         it('sets the local description to a close description and increments the revision', () => {
  //           assert.deepEqual(test.pcv2.getState(), test.state().setDescription(makeClose(), revision));
  //         });

  //         it('emits a "description" event with the new local description', () => {
  //           assert.deepEqual(description, test.state().setDescription(makeClose(), revision));
  //         });
  //       }
  //     });
  //   });

  //   it('removes RTCDataChannels from any DataTrackSenders currently added to the PeerConnectionV2', () => {
  //     const test = makeTest();
  //     const dataTrackSender1 = makeDataTrackSender();
  //     const dataTrackSender2 = makeDataTrackSender();
  //     test.pcv2.addDataTrackSender(dataTrackSender1);
  //     test.pcv2.addDataTrackSender(dataTrackSender2);
  //     test.pcv2.removeDataTrackSender(dataTrackSender1);
  //     dataTrackSender1.removeDataChannel.reset();
  //     test.pcv2.close();
  //     sinon.assert.notCalled(dataTrackSender1.removeDataChannel);
  //     sinon.assert.calledOnce(dataTrackSender2.removeDataChannel);
  //     sinon.assert.calledWith(dataTrackSender2.removeDataChannel, test.pc.dataChannels[1]);
  //   });
  // });

  describe('#getTrackReceivers', () => {
    it('returns DataTrackReceivers and MediaTrackReceivers for any RTCDataChannels and MediaStreamTracks raised by the underlying RTCPeerConnection that have yet to be closed/ended', () => {
      const test = makeTest();
      const dataChannel1 = makeDataChannel();
      const dataChannel2 = makeDataChannel();
      const dataChannel3 = makeDataChannel();
      const mediaTrack1 = new FakeMediaStreamTrack('audio');
      const mediaTrack2 = new FakeMediaStreamTrack('video');

      function getTrackIdOrChannelLabel({ id, label }) {
        return id || label;
      }

      test.pc.dispatchEvent({ type: 'datachannel', channel: dataChannel1 });
      test.pc.dispatchEvent({ type: 'datachannel', channel: dataChannel2 });
      test.pc.dispatchEvent({ type: 'datachannel', channel: dataChannel3 });
      test.pc.dispatchEvent({ type: 'track', track: mediaTrack1 });
      test.pc.dispatchEvent({ type: 'track', track: mediaTrack2 });

      assert.deepEqual(test.pcv2.getTrackReceivers().map(receiver => receiver.id),
        [dataChannel1, dataChannel2, dataChannel3, mediaTrack1, mediaTrack2].map(getTrackIdOrChannelLabel));

      dataChannel1.dispatchEvent({ type: 'close' });
      mediaTrack1.dispatchEvent({ type: 'ended' });

      assert.deepEqual(test.pcv2.getTrackReceivers().map(receiver => receiver.id),
        [dataChannel2, dataChannel3, mediaTrack2].map(getTrackIdOrChannelLabel));
    });
  });


});

/**
 * @interace TestOptions
 * @extends MockPeerConnectionOptions
 * @extends PeerConnectionV2Options
 * @property {string} [id]
 * @property {MockPeerConnection} [pc]
 * @property {PeerConnectionV2} [pcv2]
 */

/**
 * @interface Test
 * @extends TestOptions
 * @property {string} id
 * @property {MockPeerConnection} pc
 * @property {PeerConnectionV2} pcv2
 * @property {function(): PeerConnectionStateBuilder} state
 */

/**
 * @extends RTCPeerConnection
 * @property {Array<MediaStream>} localStreams
 * @property {Array<MediaStream>} remoteStreams
 * @property {number} offerIndex
 * @property {number} answerIndex
 * @property {Array<Description>} offers
 * @property {Array<Description>} answers
 * @property {?string} errorScenario
 */
class MockPeerConnection extends EventEmitter {
  /**
   * Construct a {@link MockPeerConnection}.
   * @param {Array<Description>} offers
   * @param {Array<Description>} answers
   * @param {?string} [errorScenario]
   */
  constructor(offers, answers, errorScenario) {
    super();

    this.receivers = [];
    this.senders = [];
    this.transceivers = [];

    this.offerIndex = 0;
    this.answerIndex = 0;
    this.dataChannelIndex = 0;

    this.offers = offers;
    this.answers = answers;
    this.dataChannels = [];
    this.errorScenario = errorScenario || null;

    this.signalingState = 'stable';
    this.iceConnectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
  }

  addEventListener() {
    return this.addListener.apply(this, arguments);
  }

  removeEventListener() {
    return this.removeListener.apply(this, arguments);
  }

  dispatchEvent(event) {
    this.emit(event.type, event);
  }

  setLocalDescription(description) {
    if (this.errorScenario === 'setLocalDescription') {
      return Promise.reject(new Error('Testing setLocalDescription error'));
    } else if (this.signalingState === 'stable' &&
        description.type === 'offer') {
      this.signalingState = 'have-local-offer';
      this.emit('signalingstatechange');
    } else if (this.signalingState === 'have-remote-offer' &&
               (description.type === 'answer' || description.type === 'rollback')) {
      this.signalingState = 'stable';
      this.emit('signalingstatechange');
    }

    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description) {
    if (this.errorScenario === 'setRemoteDescription') {
      return Promise.reject(new Error('Testing setRemoteDescription error'));
    } else if (this.signalingState === 'stable' &&
        description.type === 'offer') {
      this.signalingState = 'have-remote-offer';
      this.emit('signalingstatechanged');
    } else if (this.signalingState === 'have-local-offer' &&
               (description.type === 'answer' || description.type === 'rollback')) {
      this.signalingState = 'stable';
      this.emit('signalingstatechange');
    }

    this.remoteDescription = description;
    return Promise.resolve();
  }

  createOffer() {
    if (this.errorScenario === 'createOffer') {
      return Promise.reject(new Error('Testing createOffer error'));
    }

    const offer = this.offers[this.offerIndex++];
    return offer
      ? Promise.resolve(offer)
      : Promise.reject(new Error('Ran out of offers'));
  }

  createAnswer() {
    if (this.errorScenario === 'createAnswer') {
      return Promise.reject(new Error('Testing createAnswer error'));
    }

    const answer = this.answers[this.answerIndex++];
    return answer
      ? Promise.resolve(answer)
      : Promise.reject(new Error('Ran out of answers'));
  }

  createDataChannel(label, options) {
    const dataChannel = this.dataChannels[this.dataChannelIndex++] = Object.assign({
      close: sinon.spy(() => {}),
      label
    }, options);
    return dataChannel;
  }

  close() {
    this.signalingState = 'closed';
    this.emit('signalingstatechange');
  }

  addTrack(track) {
    const sender = {
      getParameters: sinon.spy(() => ({ encodings: [{}] })),
      setParameters: sinon.spy(() => Promise.resolve()),
      track
    };
    this.senders.push(sender);
    return sender;
  }

  removeTrack(sender) {
    const i = this.senders.indexOf(sender);
    if (i > -1) {
      this.senders.splice(i);
    }
  }

  addTransceiver(track) {
    const sender = this.addTrack(track);
    const transceiver = {
      sender
    };
    this.transceivers.push(transceiver);
    return transceiver;
  }

  getSenders() {
    return this.senders;
  }

  getReceivers() {
    return this.receivers;
  }

  getTransceivers() {
    return this.transceivers;
  }

  addIceCandidate() {
    return Promise.resolve();
  }
}

/**
 * Make a random {@link PeerConnectionV2} ID.
 * @returns {number} id
 */
function makeId() {
  return Math.floor(Math.random() * 100 + 0.5);
}

/**
 * Make a random MediaStreamTrack kind.
 * @returns {string} - 'audio'|'video'
 */
function makeMediaKind() {
  const rand = Math.floor(Math.random() + 0.5);
  return rand < 0.5 ? 'audio' : 'video';
}

/**
 * The identity function.
 * @param {A} a
 * @returns {A} a
 */
function identity(a) {
  return a;
}

/**
 * @interface PeerConnectionV2Options
 * @property {string} [id]
 * @property {MockPeerConnection} [pc]
 * @property {RTCPeerConnection.} [RTCPeerConnection]
 */

/**
 * Make a {@link PeerConnectionV2}. This function extends any options object
 * you pass it.
 * @param {PeerConnectionV2Options} [options]
 * @returns {PeerConnectionV2}
 */
function makePeerConnectionV2(options) {
  options = options || {};
  options.id = options.id || makeId();

  const pc = options.pc || makePeerConnection(options);
  const getSettings = () => { return { width: 1280, height: 720 }; };
  const tracks = options.tracks || [{ kind: 'audio' }, { kind: 'video', getSettings }];
  tracks.forEach(track => pc.addTrack(track));

  const Backoff = {
    exponential() {
      const backoff = new EventEmitter();
      backoff.backoff = sinon.spy(() => backoff.emit('ready'));
      backoff.reset = sinon.spy(() => {});
      return backoff;
    }
  };

  function RTCPeerConnection() {
    return pc;
  }

  options.Backoff = options.Backoff || Backoff;
  options.RTCPeerConnection = options.RTCPeerConnection || RTCPeerConnection;
  options.isChromeScreenShareTrack = options.isChromeScreenShareTrack || sinon.spy(() => false);
  options.sessionTimeout = options.sessionTimeout || 100;
  options.setCodecPreferences = options.setCodecPreferences || sinon.spy(sdp => sdp);
  options.preferredCodecs = options.preferredcodecs || { audio: [], video: [] };
  options.options = {
    Backoff: options.Backoff,
    Event: function(type) { return { type: type }; },
    RTCIceCandidate: identity,
    RTCPeerConnection: options.RTCPeerConnection,
    RTCSessionDescription: identity,
    isChromeScreenShareTrack: options.isChromeScreenShareTrack,
    eventObserver: options.eventObserver || { emit: sinon.spy() },
    sessionTimeout: options.sessionTimeout,
    setCodecPreferences: options.setCodecPreferences
  };

  if (options.enableDscp !== undefined) {
    options.options.enableDscp = options.enableDscp;
  }

  return new PeerConnectionV2(options.id, makeEncodingParameters(options), options.preferredCodecs, options.options);
}

/**
 * @classdesc A {@link PeerConnectionStateBuilder} makes it easier to build the
 *   Room Signaling Protocol (RSP) payloads expected by a
 *   {@link PeerConnectionV2}.
 * @property {string} id
 */
class PeerConnectionStateBuilder {
  /**
   * Construct a {@link PeerConnectionStateBuilder}.
   * @param {string} id
   */
  constructor(id) {
    this.id = id;
  }

  /**
   * Set a description.
   * @param {RTCSessionDescriptionInit} description
   * @param {number} revision
   * @returns {this}
   */
  setDescription(description, revision) {
    this.description = Object.assign({
      revision: revision
    }, description);

    return this;
  }

  /**
   * Set ICE.
   * @param {ICE} ice
   * @returns {this}
   */
  setIce(ice) {
    this.ice = {
      candidates: ice.candidates.slice(),
      revision: ice.revision,
      ufrag: ice.ufrag
    };

    return this;
  }
}

/**
 * Make a {@link Test}. This function extends any options object you pass it.
 * @param {TestOptions} [options]
 * @returns {Test}
 */
function makeTest(options) {
  options = options || {};
  options.id = options.id || makeId();
  options.pc = options.pc || makePeerConnection(options);
  options.pcv2 = makePeerConnectionV2(options);

  const id = options.id;
  options.state = function state() {
    return new PeerConnectionStateBuilder(id);
  };

  return options;
}

/**
 * @extends RTCSessionDescription
 */
class Description {
  /**
   * Construct a {@link Description}.
   * @param {RTCSessionDescriptionInit} description
   */
  constructor(description) {
    Object.assign(this, description);
  }
}

/**
 * @interface DescriptionOptions
 * @property {string} [ufrag]
 */

/**
 * Make a {@link Description}. This function extends any options object you
 * pass it.
 * @param {string} type - "offer", "answer", "pranswer", "rollback",
 *   or "create-offer"
 * @param {DescriptionOptions} [options]
 */
function makeDescription(type, options) {
  options = options || {};

  const description = {
    type: type
  };

  if (type === 'offer' ||
      type === 'answer' ||
      type === 'pranswer') {
    const session = 'session' in options ? options.session : Number.parseInt(Math.random() * 1000);
    description.sdp = 'o=- ' + session + '\r\n';
    if (options.iceLite) {
      description.sdp += 'a=ice-lite\r\n';
    }
    if (options.application) {
      description.sdp += 'm=application foo bar baz\r\na=sendrecv\r\n';
    }
    if (options.ufrag) {
      description.sdp += 'a=ice-ufrag:' + options.ufrag + '\r\n';
    }
  }

  return new Description(description);
}

/**
 * Make a "close" {@link Description}.
 * @returns {Description}
 */
function makeClose() {
  return makeDescription('close');
}

/**
 * Make a "create-offer" {@link Description}.
 * @returns {Description}
 */
function makeCreateOffer() {
  return makeDescription('create-offer');
}

/**
 * Make a "offer" {@link Description}.
 * @returns {Description}
 */
function makeOffer(options) {
  return makeDescription('offer', options);
}

/**
 * Make a "answer" {@link Description}.
 * @returns {Description}
 */
function makeAnswer(options) {
  return makeDescription('answer', options);
}

/**
 * @interface ICE
 * @property {Array<RTCIceCandidateInit>} candidates
 * @property {number} revision
 * @property {string} ufrag
 */

/**
 * Make {@link ICE}. Count specifies both the revision and the number of ICE
 * candidates to generate.
 * @param {string} ufrag
 * @param {number} [count=0]
 * @returns {ICE}
 */
function makeIce(ufrag, count) {
  count = count || 0;

  const ice = {
    candidates: [],
    revision: count,
    ufrag: ufrag
  };

  for (let i = 0; i < count; i++) {
    ice.candidates.push({ candidate: 'candidate' + (i + 1) });
  }

  return ice;
}

function makeDataTrackSender(id) {
  id = id || makeId();
  return {
    id,
    addDataChannel: sinon.spy(() => {}),
    removeDataChannel: sinon.spy(() => {})
  };
}

function makeMediaTrackSender(track) {
  const id = track.id = track.id || makeId();
  const kind = track.kind = track.kind || makeMediaKind();
  return {
    id,
    kind,
    track,
    addSender: sinon.spy(() => {}),
    removeSender: sinon.spy(() => {})
  };
}

function makeDataChannel(id) {
  id = id || makeId();
  const dataChannel = new EventTarget();
  dataChannel.close = sinon.spy(() => {});
  dataChannel.label = id;
  dataChannel.close = sinon.spy(() => {});
  return dataChannel;
}

function makePublisherHints(layerIndex, enabled) {
  // eslint-disable-next-line camelcase
  return [{ enabled, layer_index: layerIndex }];
}

/**
 * @interface MockPeerConnectionOptions
 * @property {number|Array<RTCSessionDescriptionInit|Description>} [offers=0] -
 *   provide a number to seed the {@link MockPeerConnection} with exactly that
 *   number of offers; otherwise, you can provide RTCSessionDescriptionInit or
 *   {@link Description} instances directly
 * @property {number|Array<RTCSessionDescriptionInit|Description>} [answers=0] -
 *   number of answers; otherwise, you can provide RTCSessionDescriptionInit or
 *   {@link Description} instances directly
 * @property {string} [errorScenario] - one of "createOffer", "createAnswer",
 *   "setLocalDescription", or "setRemoteDescription"; set to cause one of
 *   these methods to fail
 */

/**
 * Make a {@link MockPeerConnection}. This function extends any options object
 * you pass it.
 * @param {MockPeerConnectionOptions} [options]
 * @returns {MockPeerConnectionOptions}
 */
function makePeerConnection(options) {
  options = options || {};
  options.offers = options.offers || [];
  options.answers = options.answers || [];

  if (typeof options.offers === 'number') {
    const offers = [];
    for (let i = 0; i < options.offers; i++) {
      offers.push(makeOffer());
    }
    options.offers = offers;
  }

  if (typeof options.answers === 'number') {
    const answers = [];
    for (let i = 0; i < options.answers; i++) {
      answers.push(makeAnswer());
    }
    options.answers = answers;
  }

  options.offers = options.offers.map(description =>
    description instanceof Description
      ? description
      : new Description(description));

  options.answers = options.answers.map(description =>
    description instanceof Description
      ? description
      : new Description(description));

  return new MockPeerConnection(
    options.offers,
    options.answers,
    options.errorScenario);
}

function oneTick() {
  return new Promise(resolve => setTimeout(resolve));
}
