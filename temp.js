

describe('PeerConnectionV2', () => {















  describe('#getState', () => {
    [
      [
        'before setting a local description',
        () => {},
        () => null
      ],
      [
        'after setting a local description by calling #close',
        test => test.pcv2.close(),
        test => test.state().setDescription(makeClose(), 1)
      ],
      [
        'after setting a local description by calling #offer',
        test => test.pcv2.offer(),
        test => test.state().setDescription(test.offers[0], 1)
      ],
      [
        'after setting a local description by calling #update with an answer description',
        async test => {
          await test.pcv2.offer();
          await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));
        },
        test => test.state().setDescription(test.offers[0], 1)
      ],
      [
        'after setting a local description by calling #update with a close description',
        test => test.pcv2.update(test.state().setDescription(makeClose(), 1)),
        () => null
      ],
      [
        'after setting a local description by calling #update with an offer description',
        test => test.pcv2.update(test.state().setDescription(makeOffer(), 1)),
        test => test.state().setDescription(test.answers[0], 1)
      ]
    ].forEach(([description, before, expectedState]) => {
      let test;

      context(description, () => {
        beforeEach(async () => {
          test = makeTest({ offers: 1, answers: 1 });
          await before(test);
        });

        it('returns the local description', () => {
          assert.deepEqual(test.pcv2.getState(), expectedState(test));
        });
      });
    });

    it('returns last stable answer version when while new offer is being processed', async () => {
      // Apply remote offer for revision 1
      const test = makeTest({ offers: 3, answers: 3 });

      // Apply remote offer for revision 1
      await test.pcv2.update(test.state().setDescription(makeOffer(), 1));

      // getState should return the answer sdp with revision 1.
      assert.equal(test.pcv2._lastStableDescriptionRevision, 1);
      assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.answers[0], 1));

      // resolve deferred promise when setRemoteDescription is called.
      const setRemoteDescriptionCalled = defer();
      const setRemoteDescriptionStub = sinon.stub(test.pc, 'setRemoteDescription');
      setRemoteDescriptionStub.callsFake(() => {
        setRemoteDescriptionCalled.resolve();
        // eslint-disable-next-line no-undef
        return setRemoteDescriptionStub.wrappedMethod.apply(test.pc, arguments);
      });

      // Apply remote offer for revision 2
      const updatePromise = test.pcv2.update(test.state().setDescription(makeOffer(), 2));

      // getState when called before the update is finished.
      // should return the last answer with last stable revision.
      assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.answers[0], 1));

      // even after setRemoteDescriptionCalled getState should returned revision 1 answer.
      await setRemoteDescriptionCalled.promise;
      assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.answers[0], 1));

      // and once the update is finished.
      await updatePromise;

      // should return new answer with new revision.
      assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.answers[1], 2));

      setRemoteDescriptionStub.restore();
    });
  });

  describe('#offer', () => {
    combinationContext([
      [
        ['stable', 'have-local-offer'],
        x => `in signaling state "${x}"`
      ]
    ], ([signalingState]) => {
      let test;
      let descriptions;
      let rev;
      let stateBefore;
      let signalingStateBefore;
      let result;

      if (signalingState === 'have-local-offer') {
        beforeEach(setup);
        return itShouldEventuallyCreateOffer();
      }

      beforeEach(setup);
      return itShouldCreateOffer();

      async function setup() {
        test = makeTest({ offers: [makeOffer({ session: 1 }), makeOffer({ session: 2 }), makeOffer({ session: 3 })] });
        descriptions = [];
        rev = 0;

        switch (signalingState) {
          case 'stable':
            break;
          default: // 'have-local-offer'
            await test.pcv2.offer();
            break;
        }

        test.pcv2.on('description', description => descriptions.push(description));
        test.pc.createOffer = sinon.spy(test.pc.createOffer);
        test.pc.setLocalDescription = sinon.spy(test.pc.setLocalDescription);

        stateBefore = test.pcv2.getState();
        signalingStateBefore = test.pc.signalingState;

        result = await test.pcv2.offer();
      }

      function itShouldCreateOffer() {
        const expectedOfferIndex = {
          'stable': 0,
          'have-local-offer': 1
        }[signalingState];

        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call createOffer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createOffer);
        });

        // NOTE(mroberts): This test should really be extended. Instead of popping
        // arguments off of `setCodecPreferences`, we should validate that we
        // apply transformed remote SDPs and emit transformed local SDPs.
        it('should transform the resulting offer by applying any codec preferences', () => {
          const preferredVideoCodecs = test.setCodecPreferences.args[0].pop();
          const preferredAudioCodecs = test.setCodecPreferences.args[0].pop();
          assert.equal(preferredAudioCodecs, test.preferredCodecs.audio);
          assert.equal(preferredVideoCodecs, test.preferredCodecs.video);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the transformed offer', () => {
          sinon.assert.calledOnce(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.offers[expectedOfferIndex]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the transformed offer at the newer revision', () => {
          const expectedRev = signalingState === 'have-local-offer' ? rev + 2 : rev + 1;
          assert.equal(descriptions.length, 1);
          assert.deepEqual(descriptions[0], test.state().setDescription(test.offers[expectedOfferIndex], expectedRev));
        });

        it('should set the state on the PeerConnectionV2 to the transformed offer at the newer revision', () => {
          const expectedRev = signalingState === 'have-local-offer' ? rev + 2 : rev + 1;
          assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.offers[expectedOfferIndex], expectedRev));
        });

        it('should leave the underlying RTCPeerConnection in signalingState "have-local-offer"', () => {
          assert.equal(test.pc.signalingState, 'have-local-offer');
        });
      }

      function itShouldEventuallyCreateOffer() {
        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should not emit a "description" event', () => {
          assert.equal(descriptions.length, 0);
        });

        it('should not change the state on the PeerConnectionV2', () => {
          assert.deepEqual(test.pcv2.getState(), stateBefore);
        });

        it('should not change the signalingState on the underlying RTCPeerConnection', () => {
          assert.equal(test.pc.signalingState, signalingStateBefore);
        });

        context('then, once the initial answer is received', () => {
          beforeEach(async () => {
            const answer = makeAnswer();
            const answerDescription = test.state().setDescription(answer, 1);
            await test.pcv2.update(answerDescription);
          });

          itShouldCreateOffer();
        });
      }
    });

    // eslint-disable-next-line no-warning-comments
    // TODO(mroberts): Would be nice to somehow consolidate this with the
    // `beforeEach` call (or move it out).
    ['createOffer', 'setLocalDescription'].forEach(errorScenario => {
      let test;

      beforeEach(async () => {
        test = makeTest({ offers: 2 });

        await Promise.all([
          new Promise(resolve => test.pcv2.once('description', resolve)),
          test.pcv2.offer()
        ]);
      });

      context(`when ${errorScenario} on the underlying RTCPeerConnection fails`, () => {
        it('should throw a MediaClientLocalDescFailedError', async () => {
          const test = makeTest({ offers: 1, errorScenario });
          try {
            await test.pcv2.offer();
          } catch (error) {
            assert(error instanceof MediaClientLocalDescFailedError);
            assert.equal(error.code, 53400);
            return;
          }
          throw new Error('Unexpected resolution');
        });
      });
    });
  });

  describe('#removeDataTrackSender, called with a DataTrackSender that has', () => {
    let test;
    let dataTrackSender;
    let result;

    beforeEach(() => {
      test = makeTest();
      dataTrackSender = makeDataTrackSender();
    });

    describe('never been added', () => {
      beforeEach(() => {
        result = test.pcv2.removeDataTrackSender(dataTrackSender);
      });

      it('does not call removeDataChannel on the DataTrackSender', () => {
        sinon.assert.notCalled(dataTrackSender.removeDataChannel);
      });

      it('returns undefined', () => {
        assert.equal(result, undefined);
      });
    });

    describe('been added', () => {
      beforeEach(() => {
        test.pcv2.addDataTrackSender(dataTrackSender);
        result = test.pcv2.removeDataTrackSender(dataTrackSender);
      });

      it('calls removeDataChannel on the DataTrackSender with the underlying RTCDataChannel', () => {
        sinon.assert.calledOnce(dataTrackSender.removeDataChannel);
        sinon.assert.calledWith(dataTrackSender.removeDataChannel, test.pc.dataChannels[0]);
      });

      it('calls .close on the underlying RTCDataChannel', () => {
        sinon.assert.calledOnce(test.pc.dataChannels[0].close);
      });

      it('returns undefined', () => {
        assert.equal(result, undefined);
      });
    });

    describe('been removed', () => {
      beforeEach(() => {
        test.pcv2.addDataTrackSender(dataTrackSender);
        test.pcv2.removeDataTrackSender(dataTrackSender);
        test.pc.dataChannels[0].close.reset();
        dataTrackSender.removeDataChannel.reset();
        result = test.pcv2.removeDataTrackSender(dataTrackSender);
      });

      it('does not call removeDataChannel on the DataTrackSender', () => {
        sinon.assert.notCalled(dataTrackSender.removeDataChannel);
      });

      it('does not call .close on the underlying RTCDataChannel', () => {
        sinon.assert.notCalled(test.pc.dataChannels[0].close);
      });

      it('returns undefined', () => {
        assert.equal(result, undefined);
      });
    });
  });

  describe('#removeMediaTrackSender', () => {
    let test;
    let stream;
    let result;
    let trackSender;

    [true, false].forEach(shouldClosePeerConnection => {
      context(`peerConnection is ${shouldClosePeerConnection ? '' : 'not '}closed`, () => {
        [
          ['never been added', () => {}],
          ['been added', (test, trackSender) => {
            test.pcv2.addMediaTrackSender(trackSender);
          }],
          ['been removed', (test, trackSender) => {
            test.pcv2.addMediaTrackSender(trackSender);
            test.pcv2.removeMediaTrackSender(trackSender);
          }]
        ].forEach(([scenario, setup]) => {
          context(scenario, () => {
            beforeEach(() => {
              test = makeTest();
              const tracks = [{ id: 1 }];
              stream = { getTracks() { return tracks; } };
              trackSender = makeMediaTrackSender(tracks[0]);
              setup(test, trackSender, stream);
              test.pc.removeTrack = sinon.spy(() => {});

              if (shouldClosePeerConnection) {
                test.pcv2.close();
              }

              result = test.pcv2.removeMediaTrackSender(trackSender);
            });

            it('returns undefined', () => {
              assert(!result);
            });

            if (scenario === 'been added') {
              it(`${shouldClosePeerConnection ? 'does not call' : 'calls'} removeTrack on the underlying RTCPeerConnection`, () => {
                if (shouldClosePeerConnection) {
                  sinon.assert.notCalled(test.pc.removeTrack);
                } else {
                  assert.equal(test.pc.removeTrack.args[0][0].track, stream.getTracks()[0]);
                }
              });

              it('should remove the RTCRtpSender from the MediaTrackSender', () => {
                sinon.assert.called(trackSender.removeSender);
              });
              return;
            }

            it('does not call removeTrack on the underlying RTCPeerConnection', () => {
              sinon.assert.notCalled(test.pc.removeTrack);
            });
          });
        });
      });
    });
  });

  describe('#setConfiguration', () => {
    let test;

    beforeEach(() => {
      test = makeTest();
    });

    context('when setConfiguration is supported by the underlying RTCPeerConnection', () => {
      it('calls setConfiguration on the underlying RTCPeerConnection', () => {
        let configuration;
        test.pc.setConfiguration = _configuration => {
          configuration = _configuration;
        };

        test.pcv2.setConfiguration({
          iceServers: ['foo'],
          iceTransportPolicy: 'bar'
        });

        assert.deepEqual(
          configuration,
          {
            bundlePolicy: 'max-bundle',
            iceServers: ['foo'],
            iceTransportPolicy: 'bar',
            rtcpMuxPolicy: 'require'
          });
      });
    });

    context('when setConfiguration is not supported by the underlying RTCPeerConnection', () => {
      it('does not call setConfiguration on the underlying RTCPeerConnection', () => {
        test.pcv2.setConfiguration({ fizz: 'buzz' });
      });
    });
  });

  describe('#update, called', () => {
    combinationContext([
      [
        [true, false],
        x => `${x ? 'before' : 'after'} the initial round of negotiation`
      ],
      [
        [false, true],
        x => `${x ? 'after' : 'before'} vms-fail-over`
      ],
      [
        ['stable', 'have-local-offer', 'closed'],
        x => `in signalingState "${x}"`
      ],
      [
        ['offer', 'answer', 'create-offer', 'close'],
        x => `with ${a(x)} "${x}" description`
      ],
      [
        ['newer', 'equal', 'older'],
        x => `at ${a(x)} ${x} revision`
      ],
      [
        [true, false],
        x => `when matching ICE candidates have ${x ? '' : 'not '}been received`
      ],
      [
        [true, false],
        x => `when the remote peer is ${x ? '' : 'not '}an ICE-lite agent`
      ],
      [
        [true, false],
        x => `When RTCRtpSenderParameters is ${x ? '' : 'not '}supported by WebRTC`
      ],
      [
        [true, false, undefined],
        x => `When enableDscp is ${typeof x === 'undefined' ? 'not specified' : `set to ${x}`}`
      ],
      [
        [true, false],
        // limit only to isRTCRtpSenderParamsSupported
        x => `When chromeScreenTrack is ${x ? 'present' : 'not present'}`
      ],
    // eslint-disable-next-line consistent-return
    ], ([initial, vmsFailOver, signalingState, type, newerEqualOrOlder, matching, iceLite, isRTCRtpSenderParamsSupported, enableDscp, chromeScreenTrack]) => {
      // these combinations grow exponentially
      // skip the ones that do not make much sense to test.
      if (vmsFailOver && (!initial || type !== 'offer' || signalingState !== 'have-local-offer')) {
        // vms fail over case is only interesting before negotiation is finished
        return;
      }

      if (!isRTCRtpSenderParamsSupported && (chromeScreenTrack || enableDscp)) {
        // screen share track and dscp options have special cases only when isRTCRtpSenderParamsSupported.
        return;
      }

      if (iceLite && (isRTCRtpSenderParamsSupported || enableDscp || chromeScreenTrack)) {
        // iceLite does not need repeat for all combination of unrelated variables.
        return;
      }

      // The Test
      let test;

      // Any candidates passed to `update`.
      let candidates;

      // The Description passed to `update`
      let desc;

      // The Description's revision
      let rev;

      // createOffer revision
      let lastOfferRevision;

      // Description events emitted by the PeerConnectionV2
      let descriptions;

      // The PeerConnectionV2's state before calling `update`
      let stateBefore;

      // The underlying RTCPeerConnection's signalingState before calling `update`
      let signalingStateBefore;

      // The result of calling `update`
      let result;

      async function setup() {
        let tracks;
        if (chromeScreenTrack) {
          const getSettings = () => { return { width: 1280, height: 720 }; };
          tracks = [{ id: 'foo', kind: 'video', label: 'screen:123', getSettings }];
        }
        test = makeTest({
          offers: 3,
          answers: 2,
          maxAudioBitrate: 40,
          maxVideoBitrate: 50,
          enableDscp,
          isChromeScreenShareTrack: () => chromeScreenTrack,
          isRTCRtpSenderParamsSupported,
          tracks,
        });
        descriptions = [];
        const ufrag = 'foo';

        // NOTE(mroberts): If this test takes place after an initial round of
        // negotiation, then we need to `offer` and `update` with an answer.
        // The first `offer` should always set the Description revision to 1;
        // hence, we answer with revision 1.
        if (!initial) {
          await test.pcv2.offer();
          const answer = makeAnswer({ iceLite });
          const answerDescription = test.state().setDescription(answer, 1);
          await test.pcv2.update(answerDescription);
        }

        // NOTE(mroberts): Transition to the desired `signalingState`.
        switch (signalingState) {
          case 'stable':
            break;
          case 'have-local-offer':
            await test.pcv2.offer();
            break;
          default: // 'closed'
            test.pcv2.close();
            break;
        }

        if (vmsFailOver && initial && type === 'offer' && signalingState === 'have-local-offer') {
          // in case of vms fail-over, new PC get to 'have-local-offer' state
          // by VMS sending create-offer message. Which ends up setting a
          // test.pcv2._descriptionRevision. lets simulate that.
          lastOfferRevision = 25; // even though its 'initial' state - last offer will not be 1.
          test.pcv2._descriptionRevision = lastOfferRevision;
          rev = test.pcv2._descriptionRevision + 1;
        } else {
          lastOfferRevision = 1;
          rev = test.pcv2._lastStableDescriptionRevision;
        }

        switch (newerEqualOrOlder) {
          case 'newer':
            rev += 2;
            break;
          case 'equal':
            if (type === 'answer') {
              rev++;
            }
            break;
          default: // 'older'
            if (type === 'answer') {
              break;
            }
            rev--;
            break;
        }

        // NOTE(mroberts): Construct the requested Description.
        desc = null;
        switch (type) {
          case 'offer': {
            const offer = makeOffer({ iceLite, ufrag });
            desc = test.state().setDescription(offer, rev);
            break;
          }
          case 'answer': {
            const answer = makeAnswer({ iceLite, ufrag });
            desc = test.state().setDescription(answer, rev);
            break;
          }
          case 'create-offer': {
            const createOffer = makeCreateOffer();
            desc = test.state().setDescription(createOffer, rev);
            break;
          }
          default: { // 'close'
            const close = makeClose();
            desc = test.state().setDescription(close, rev);
            break;
          }
        }

        // NOTE(mroberts): Setup spies and capture "description" events.
        test.pcv2.on('description', description => descriptions.push(description));
        test.pc.addIceCandidate = sinon.spy(test.pc.addIceCandidate);
        test.pc.close = sinon.spy(test.pc.close);
        test.pc.createAnswer = sinon.spy(test.pc.createAnswer);
        test.pc.createOffer = sinon.spy(test.pc.createOffer);
        test.pc.setLocalDescription = sinon.spy(test.pc.setLocalDescription);
        test.pc.setRemoteDescription = sinon.spy(test.pc.setRemoteDescription);

        stateBefore = test.pcv2.getState();
        signalingStateBefore = test.pc.signalingState;

        if (matching) {
          const ice = makeIce(ufrag, 2);
          candidates = ice.candidates;

          const iceState = test.state().setIce(ice);
          await test.pcv2.update(iceState);

          // NOTE(mroberts): Sanity check.
          sinon.assert.notCalled(test.pc.addIceCandidate);
          assert.deepEqual(test.pcv2.getState(), stateBefore);
          assert.deepEqual(test.pc.signalingState, signalingStateBefore);
        }

        result = await test.pcv2.update(desc);
      }

      if (signalingState !== 'closed') {
        switch (type) {
          case 'offer':
            if (newerEqualOrOlder !== 'newer') {
              break;
            }
            beforeEach(setup);
            if (signalingState === 'have-local-offer') {
              if (initial) {
                itMightEventuallyAnswer();
              } else {
                itShouldHandleGlare();
              }
            } else {
              itShouldAnswer();
            }
            break;
          case 'answer':
            if (newerEqualOrOlder !== 'equal' || signalingState !== 'have-local-offer') {
              break;
            }
            beforeEach(setup);
            itShouldApplyAnswer();
            break;
          case 'create-offer':
            if (newerEqualOrOlder !== 'newer') {
              break;
            }
            beforeEach(setup);
            if (signalingState === 'have-local-offer') {
              itShouldEventuallyCreateOffer();
            } else {
              itShouldCreateOffer();
            }
            break;
          default: // 'close'
            beforeEach(setup);
            itShouldClose();
            break;
        }
      } else {
        beforeEach(setup);
        itDoesNothing();
      }

      function itShouldApplyBandwidthConstraints() {
        it('should apply the specified bandwidth constraints for AudioTracks and non-screen VideoTracks (Chrome only)', () => {
          if (isRTCRtpSenderParamsSupported) {
            test.pc.getSenders().forEach(sender => {
              const expectedMaxBitRate = sender.track.kind === 'audio' ? test.maxAudioBitrate : test.maxVideoBitrate;
              if (sender.track.kind === 'video' && chromeScreenTrack)  {
                sinon.assert.neverCalledWith(sender.setParameters, sinon.match.hasNested('encodings[0].maxBitrate', expectedMaxBitRate));
              } else {
                sinon.assert.calledWith(sender.setParameters, sinon.match.hasNested('encodings[0].maxBitrate', expectedMaxBitRate));
              }
            });
            return;
          }
          const maxVideoBitrate = test.setBitrateParameters.args[0].pop();
          const maxAudioBitrate = test.setBitrateParameters.args[0].pop();
          assert.equal(maxAudioBitrate, test.maxAudioBitrate);
          assert.equal(maxVideoBitrate, test.maxVideoBitrate);
        });
      }

      function itShouldMaybeSetNetworkPriority() {
        if (enableDscp && isRTCRtpSenderParamsSupported) {
          it('should set RTCRtpEncodingParameters.networkPriority to "high" all RTCRtpSenders', () => {
            test.pc.getSenders().forEach(sender => {
              sinon.assert.calledWith(sender.setParameters, sinon.match.hasNested('encodings[0].networkPriority', 'high'));
            });
          });
        } else {
          it('should not try to set RTCRtpEncodingParameters.networkPriority to "high" all RTCRtpSenders', () => {
            test.pc.getSenders().forEach(sender => {
              sinon.assert.neverCalledWith(sender.setParameters, sinon.match.hasNested('encodings[0].networkPriority', 'high'));
            });
          });
        }
      }

      function itShouldNotSetResolutionScale() {
        if (isRTCRtpSenderParamsSupported) {
          it('should not set RTCRtpEncodingParameters.scaleResolutionDownBy for any video senders', () => {
            test.pc.getSenders().forEach(sender => {
              if (sender.track.kind === 'video') {
                sinon.assert.calledWith(sender.setParameters, sinon.match(({ encodings }) => {
                  return !encodings.find(encoding => typeof encoding.scaleResolutionDownBy !== 'undefined');
                }));
              }
            });
          });
        }
      }

      // NOTE(mroberts): This test should really be extended. Instead of popping
      // arguments off of `setCodecPreferences`, we should validate that we
      // apply transformed remote SDPs and emit transformed local SDPs.
      function itShouldApplyCodecPreferences() {
        it('should apply the specified codec preferences to the remote description', () => {
          const preferredVideoCodecs = test.setCodecPreferences.args[0].pop();
          const preferredAudioCodecs = test.setCodecPreferences.args[0].pop();
          assert.equal(preferredAudioCodecs, test.preferredCodecs.audio);
          assert.equal(preferredVideoCodecs, test.preferredCodecs.video);
        });
      }

      function itShouldAnswer() {
        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call createAnswer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createAnswer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting answer', () => {
          sinon.assert.calledOnce(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.answers[0]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting answer at the same revision', () => {
          assert.equal(descriptions.length, 1);
          assert.deepEqual(descriptions[0], test.state().setDescription(test.answers[0], rev));
        });

        it('should set the state on the PeerConnectionV2 to the resulting answer at the same revision', () => {
          assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.answers[0], rev));
        });

        it('should leave the underlying RTCPeerConnection in signalingState "stable"', () => {
          assert.equal(test.pc.signalingState, 'stable');
        });

        it(`should detect ${iceLite ? '' : 'non-'}ICE-lite remote peer`, () => {
          assert.equal(test.pcv2._isIceLite, iceLite);
        });

        itShouldApplyBandwidthConstraints();
        itShouldApplyCodecPreferences();
        itShouldNotSetResolutionScale();
        itShouldMaybeSetNetworkPriority();
      }

      function itMightEventuallyAnswer() {
        itDoesNothing();

        // eslint-disable-next-line consistent-return
        context('then, once the initial answer is received', () => {
          beforeEach(async () => {
            const answer = makeAnswer({ iceLite });
            const answerDescription = test.state().setDescription(answer, lastOfferRevision);
            await test.pcv2.update(answerDescription);
          });

          if (newerEqualOrOlder === 'newer') {
            return itShouldAnswer();
          }

          it('returns a Promise that resolves to undefined', () => {
            assert(!result);
          });

          it('should not emit a "description" event', () => {
            assert.equal(descriptions.length, 0);
          });

          it('should not change the state on the PeerConnectionV2', () => {
            assert.deepEqual(test.pcv2.getState(), stateBefore);
          });

          it('should leave the underlying RTCPeerConnection in signalingState "stable"', () => {
            assert.equal(test.pc.signalingState, 'stable');
          });

          itShouldApplyBandwidthConstraints();
          itShouldApplyCodecPreferences();
        });
      }

      function itShouldHandleGlare() {
        const expectedOfferIndex = initial ? 1 : 2;

        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with a rollback description', () => {
          assert.deepEqual(test.pc.setLocalDescription.args[0][0], { type: 'rollback' });
        });

        it('should call setRemoteDescription on the underlying RTCPeerConnection with the offer', () => {
          sinon.assert.calledOnce(test.pc.setRemoteDescription);
          sinon.assert.calledWith(test.pc.setRemoteDescription, desc.description);
        });

        if (matching) {
          it('should call addIceCandidate on the underlying RTCPeerConnection with any previously-received, matching ICE candidates', () => {
            sinon.assert.calledTwice(test.pc.addIceCandidate);
            sinon.assert.calledWith(test.pc.addIceCandidate, candidates[0]);
            sinon.assert.calledWith(test.pc.addIceCandidate, candidates[1]);
          });
        } else {
          it('should not call addIceCandidate on the underlying RTCPeerConnection', () => {
            sinon.assert.notCalled(test.pc.addIceCandidate);
          });
        }

        it('should call createAnswer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createAnswer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting answer', () => {
          assert.deepEqual(test.pc.setLocalDescription.args[1][0], test.answers[0]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting answer at the new revision', () => {
          assert.deepEqual(descriptions[0], test.state().setDescription(test.answers[0], rev));
        });

        it('should call createOffer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createOffer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting offer', () => {
          sinon.assert.calledThrice(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.offers[expectedOfferIndex]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting offer at the newer revision', () => {
          assert.equal(descriptions.length, 2);
          assert.deepEqual(descriptions[1], test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
        });

        it('should set the state on the PeerConnectionV2 to the resulting offer at the newer revision', () => {
          assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
        });

        it('should leave the underlying RTCPeerConnection in signalingState "have-local-offer"', () => {
          assert.equal(test.pc.signalingState, 'have-local-offer');
        });

        it(`should detect ${iceLite ? '' : 'non-'}ICE-lite remote peer`, () => {
          assert.equal(test.pcv2._isIceLite, iceLite);
        });

        itShouldApplyBandwidthConstraints();
        itShouldApplyCodecPreferences();
      }

      function itShouldApplyAnswer() {
        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call setRemoteDescrption on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.setRemoteDescription);
          sinon.assert.calledWith(test.pc.setRemoteDescription, desc.description);
        });

        if (matching) {
          it('should call addIceCandidate on the underlying RTCPeerConnection with any previously-received, matching ICE candidates', () => {
            sinon.assert.calledTwice(test.pc.addIceCandidate);
            sinon.assert.calledWith(test.pc.addIceCandidate, candidates[0]);
            sinon.assert.calledWith(test.pc.addIceCandidate, candidates[1]);
          });
        } else {
          it('should not call addIceCandidate on the underlying RTCPeerConnection', () => {
            sinon.assert.notCalled(test.pc.addIceCandidate);
          });
        }

        it('should not emit a "description" event', () => {
          assert.equal(descriptions.length, 0);
        });

        it('should not change the state on the PeerConnectionV2', () => {
          assert.deepEqual(test.pcv2.getState(), stateBefore);
        });

        it('should leave the underlying RTCPeerConnection in signalingState "stable"', () => {
          assert.equal(test.pc.signalingState, 'stable');
        });

        it(`should detect ${iceLite ? '' : 'non-'}ICE-lite remote peer`, () => {
          assert.equal(test.pcv2._isIceLite, iceLite);
        });

        itShouldApplyBandwidthConstraints();
        itShouldApplyCodecPreferences();
      }

      function itShouldCreateOffer() {
        let expectedOfferIndex = initial ? 0 : 1;
        expectedOfferIndex += signalingState === 'have-local-offer' ? 1 : 0;

        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call createOffer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createOffer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting offer', () => {
          sinon.assert.calledOnce(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.offers[expectedOfferIndex]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting offer at the newer revision', () => {
          assert.equal(descriptions.length, 1);
          assert.deepEqual(descriptions[0], test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
        });

        it('should set the state on the PeerConnectionV2 to the resulting offer at the newer revision', () => {
          assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
        });

        it('should leave the underlying RTCPeerConnection in signalingState "have-local-offer"', () => {
          assert.equal(test.pc.signalingState, 'have-local-offer');
        });

        itShouldApplyCodecPreferences();
      }

      function itShouldEventuallyCreateOffer() {
        let expectedOfferIndex = initial ? 0 : 1;
        expectedOfferIndex += signalingState === 'have-local-offer' ? 1 : 0;

        itDoesNothing();

        context(`then, once the ${initial ? 'initial ' : ''}answer is received`, () => {
          beforeEach(async () => {
            const answer = makeAnswer({ iceLite });
            const answerDescription = test.state().setDescription(answer, initial ? 1 : 2);
            await test.pcv2.update(answerDescription);
          });

          it('returns a Promise that resolves to undefined', () => {
            assert(!result);
          });

          it('should call createOffer on the underlying RTCPeerConnection', () => {
            sinon.assert.calledOnce(test.pc.createOffer);
          });

          it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting offer', () => {
            sinon.assert.calledOnce(test.pc.setLocalDescription);
            sinon.assert.calledWith(test.pc.setLocalDescription, test.offers[expectedOfferIndex]);
          });

          it('should emit a "description" event with the PeerConnectionV2 state set to the resulting offer at the newer revision', () => {
            assert.equal(descriptions.length, 1);
            assert.deepEqual(descriptions[0], test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
          });

          it('should set the state on the PeerConnectionV2 to the resulting offer at the newer revision', () => {
            assert.deepEqual(test.pcv2.getState(), test.state().setDescription(test.offers[expectedOfferIndex], rev + 1));
          });

          it('should leave the underlying RTCPeerConnection in signalingState "have-local-offer"', () => {
            assert.equal(test.pc.signalingState, 'have-local-offer');
          });

          it(`should detect ${iceLite ? '' : 'non-'}ICE-lite remote peer`, () => {
            assert.equal(test.pcv2._isIceLite, iceLite);
          });

          itShouldApplyBandwidthConstraints();
          itShouldApplyCodecPreferences();
        });
      }

      function itShouldClose() {
        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should call close on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.close);
        });

        it('should not emit a "description" event', () => {
          assert.equal(descriptions.length, 0);
        });

        it('should not change the state on the PeerConnectionV2', () => {
          assert.deepEqual(test.pcv2.getState(), stateBefore);
        });

        it('should leave the underlying RTCPeerConnection in signalingState "closed"', () => {
          assert.equal(test.pc.signalingState, 'closed');
        });
      }

      function itDoesNothing() {
        it('returns a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should not emit a "description" event', () => {
          assert.equal(descriptions.length, 0);
        });

        it('should not change the state on the PeerConnectionV2', () => {
          assert.deepEqual(test.pcv2.getState(), stateBefore);
        });

        it('should not change the signalingState on the underlying RTCPeerConnection', () => {
          assert.equal(test.pc.signalingState, signalingStateBefore);
        });
      }
    });

    context('with candidates', () => {
      combinationContext([
        [
          [true, false],
          x => `whose username fragment ${x ? 'matches' : 'does not match'} that of`
        ],
        [
          ['offer', 'answer'],
          x => `the current remote "${x}" description`
        ],
        [
          ['newer', 'equal', 'older'],
          x => `at ${a(x)} ${x} revision`
        ]
      ], ([matches, type, newerEqualOrOlder]) => {
        let test;
        let candidatesUfrag;

        beforeEach(async () => {
          test = makeTest({ offers: 1, answers: 2 });

          const descriptionUfrag = 'foo';
          const descriptionRev = 1;

          candidatesUfrag = matches ? descriptionUfrag : 'bar';
          let candidatesRev = 1;

          if (type === 'answer') {
            await test.pcv2.offer();

            const answer = makeAnswer({ ufrag: descriptionUfrag });
            const answerDescription = test.state().setDescription(answer, descriptionRev);
            await test.pcv2.update(answerDescription);
          } else {
            const offer = makeOffer({ ufrag: descriptionUfrag });
            const offerDescription = test.state().setDescription(offer, descriptionRev);
            await test.pcv2.update(offerDescription);
          }

          let ice = makeIce(candidatesUfrag, candidatesRev);
          let iceState = test.state().setIce(ice, candidatesRev);
          test.pc.addIceCandidate = sinon.spy(test.pc.addIceCandidate);
          await test.pcv2.update(iceState);

          // NOTE(mroberts): Just a sanity check.
          if (matches) {
            assert.deepEqual(
              test.pc.addIceCandidate.args[0][0],
              { candidate: 'candidate1' });
          }

          switch (newerEqualOrOlder) {
            case 'newer':
              candidatesRev++;
              break;
            case 'equal':
              break;
            case 'older':
              candidatesRev--;
              break;
          }

          ice = makeIce(candidatesUfrag, candidatesRev);
          iceState = test.state().setIce(ice);
          test.pc.addIceCandidate = sinon.spy(test.pc.addIceCandidate);
          await test.pcv2.update(iceState);
        });

        if (matches && newerEqualOrOlder === 'newer') {
          it('calls addIceCandidate with any new ICE candidates on the underlying RTCPeerConnection', () => {
            sinon.assert.calledOnce(test.pc.addIceCandidate);
            assert.deepEqual(
              test.pc.addIceCandidate.args[0][0],
              { candidate: 'candidate2' });
          });
        } else {
          it('does nothing', () => {
            sinon.assert.notCalled(test.pc.addIceCandidate);
          });
        }

        context('if a remote description is then applied with a matching ICE username fragment', () => {
          beforeEach(async () => {
            const offer = makeOffer({ ufrag: candidatesUfrag });
            const offerDescription = test.state().setDescription(offer, 2);
            test.pc.addIceCandidate = sinon.spy(test.pc.addIceCandidate);
            await test.pcv2.update(offerDescription);
          });

          it('calls addIceCandidate with any new ICE candidates on the underlying RTCPeerConnection', () => {
            if (newerEqualOrOlder === 'newer') {
              sinon.assert.calledTwice(test.pc.addIceCandidate);
            } else {
              sinon.assert.calledOnce(test.pc.addIceCandidate);
            }
          });
        });
      });
    });
  });

  describe('#update, called in signaling state "stable", with an offer that', () => {
    [true, false].forEach(lacks => {
      describe(`${lacks ? 'lacks' : 'has'} an m= application section, when the PeerConnectionV2 has one ore more DataTrackSenders`, () => {
        // The Test
        let test;

        // The Description passed to `update`
        let desc;

        // Description events emitted by the PeerConnectionV2
        let descriptions;

        // The result of calling `update`
        let result;

        beforeEach(async () => {
          test = makeTest({
            offers: 1,
            answers: [makeAnswer({ application: !lacks })]
          });
          descriptions = [];

          const dataTrackSender = makeDataTrackSender();
          test.pcv2.addDataTrackSender(dataTrackSender);

          const offer = makeOffer({ application: !lacks });
          desc = test.state().setDescription(offer, 1);

          test.pcv2.on('description', description => descriptions.push(description));
          test.pc.createAnswer = sinon.spy(test.pc.createAnswer);
          test.pc.createOffer = sinon.spy(test.pc.createOffer);
          test.pc.setLocalDescription = sinon.spy(test.pc.setLocalDescription);
          test.pc.setRemoteDescription = sinon.spy(test.pc.setRemoteDescription);

          result = await test.pcv2.update(desc);
        });

        it('should return a Promise that resolves to undefined', () => {
          assert(!result);
        });

        it('should called createAnswer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createAnswer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting answer', () => {
          (lacks ? sinon.assert.calledTwice : sinon.assert.calledOnce)(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.answers[0]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting answer at the same revision', () => {
          assert.equal(descriptions.length, lacks ? 2 : 1);
          assert.deepEqual(descriptions[0], test.state().setDescription(test.answers[0], 1));
        });

        if (!lacks) {
          return;
        }

        it('should call createOffer on the underlying RTCPeerConnection', () => {
          sinon.assert.calledOnce(test.pc.createOffer);
        });

        it('should call setLocalDescription on the underlying RTCPeerConnection with the resulting answer', () => {
          sinon.assert.calledTwice(test.pc.setLocalDescription);
          sinon.assert.calledWith(test.pc.setLocalDescription, test.offers[0]);
        });

        it('should emit a "description" event with the PeerConnectionV2 state set to the resulting offer at the same revision', () => {
          assert.equal(descriptions.length, 2);
          assert.deepEqual(descriptions[1], test.state().setDescription(test.offers[0], 2));
        });
      });
    });
  });

  describe('"candidates" event', () => {
    combinationContext([
      [
        ['initial', 'subsequent', 'final'],
        x => `when the underlying RTCPeerConnection's "icecandidate" event fires ${{
          initial: 'with an initial candidate for the current username fragment',
          subsequent: 'with a subsequent candidate for the current username fragment',
          final: 'without a candidate (ICE gathering completed)'
        }[x]}`
      ],
      [
        [true, false],
        x => `when the remote peer is ${x ? '' : 'not '}an ICE-lite agent`
      ]
    ], ([which, iceLite]) => {
      let test;
      let iceState;

      before(async () => {
        test = makeTest({ offers: [makeOffer({ ufrag: 'foo' })] });
        test.pcv2._isIceLite = iceLite;

        await test.pcv2.offer();

        let iceStatePromise;

        if (which === 'initial') {
          iceStatePromise = new Promise(resolve => test.pcv2.once('candidates', resolve));
        }

        test.pc.emit('icecandidate', {
          type: 'icecandidate',
          candidate: { candidate: 'candidate1' }
        });

        if (which === 'subsequent') {
          iceStatePromise = new Promise(resolve => test.pcv2.once('candidates', resolve));
        }

        test.pc.emit('icecandidate', {
          type: 'icecandidate',
          candidate: { candidate: 'candidate2' }
        });

        if (which === 'final') {
          iceStatePromise = new Promise(resolve => test.pcv2.once('candidates', resolve));
        }

        test.pc.emit('icecandidate', {
          type: 'icecandidate',
          candidate: null
        });

        iceState = await iceStatePromise;
      });

      if (iceLite && which !== 'final') {
        it('should not emit the event', () => {
          assert.deepEqual(iceState.ice.candidates, []);
          assert(iceState.ice.complete);
        });
        return;
      }

      context('emits the event', () => {
        it('with the correct ID', () => {
          assert.equal(iceState.id, test.pcv2.id);
        });

        if (which === 'initial') {
          it('with a single-element list of ICE candidates', () => {
            assert.deepEqual(
              iceState.ice.candidates,
              [{ candidate: 'candidate1' }]);
          });
        } else {
          it(iceLite ? 'with no candidates' : 'with the full list of ICE candidates gathered up to that point', () => {
            assert.deepEqual(iceState.ice.candidates, iceLite
              ? [] : [{ candidate: 'candidate1' }, { candidate: 'candidate2' }]);
          });
        }

        if (which === 'final') {
          it('with completed set to true', () => {
            assert(iceState.ice.complete);
          });
        } else {
          it('with completed unset', () => {
            assert(!iceState.ice.complete);
          });
        }
      });
    });
  });

  describe('"trackAdded" event', () => {
    context('when "track" events are supported by the underlying RTCPeerConnection', () => {
      let test;
      let mediaStreamTrack;
      let trackReceiver;

      beforeEach(async () => {
        const pc = makePeerConnection();

        function RTCPeerConnection() {
          return pc;
        }

        RTCPeerConnection.prototype.ontrack = null;

        test = makeTest({
          RTCPeerConnection: RTCPeerConnection
        });

        mediaStreamTrack = { id: '456', addEventListener: sinon.spy(() => {}) };
        const mediaStream = { id: 'abc' };

        const trackPromise = new Promise(resolve => test.pcv2.once('trackAdded', resolve));

        pc.emit('track', {
          type: 'track',
          track: mediaStreamTrack,
          streams: [mediaStream]
        });

        trackReceiver = await trackPromise;
      });

      it('emits the "trackAdded" event with a MediaTrackReceiver', () => {
        assert.equal(trackReceiver.track, mediaStreamTrack);
      });
    });

    context('when a "datachannel" event is raised on the underlying RTCPeerConnection', () => {
      it('emits a "trackAdded" event with a DataTrackReceiver', () => {
        const test = makeTest();
        const channel = makeDataChannel();
        let trackAdded;
        test.pcv2.once('trackAdded', _trackAdded => { trackAdded = _trackAdded; });
        test.pc.dispatchEvent({ type: 'datachannel', channel });
        assert.equal(trackAdded.id, channel.label);
      });
    });
  });

  describe('when the underlying EncodingParametersImpl is updated with new values', () => {
    let test;

    before(() => {
      test = makeTest({ offers: 3, answers: 3 });
    });

    it('should emit a "description" event with a new offer', async () => {
      test.encodingParameters.update({ maxAudioBitrate: 20, maxVideoBitrate: 30 });
      const { description } = await new Promise(resolve => test.pcv2.once('description', resolve));
      assert.deepEqual({ type: description.type, sdp: description.sdp }, test.pc.localDescription);
    });
  });

  describe('ICE restart', () => {
    describe('when the underlying RTCPeerConnection\'s .iceConnectionState transitions to "failed",', () => {
      let test;

      beforeEach(async () => {
        test = makeTest({ offers: 2 });

        // Do a first round of negotiation.
        await test.pcv2.offer();
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

        // Spy on MockPeerConnection's .createOffer method.
        test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

        // Then, cause an ICE failure.
        test.pc.iceConnectionState = 'failed';
        test.pc.emit('iceconnectionstatechange');

        await oneTick();
      });

      it('the PeerConnectionV2 calls .createOffer on the underlying RTCPeerConnection with .iceRestart set to true', () => {
        // Check .iceRestart equals true.
        assert(test.pc.createOffer.calledWith({
          iceRestart: true
        }));
      });

      it('closes the PeerConnectionV2 after the ICE reconnection timeout expires', async () => {
        await new Promise(resolve => test.pcv2.once('stateChanged', resolve));
        assert.equal(test.pcv2.state, 'closed');
      });

      it('does not close the PeerConnectionV2 when the underlying RTCPeerConnection\'s .iceConnectionState transitions to "connected"', async () => {
        // Cause an ICE reconnect.
        test.pc.iceConnectionState = 'connected';
        test.pc.emit('iceconnectionstatechange');

        // Wait for the session timeout period.
        await waitForSometime(test.sessionTimeout);

        assert.equal(test.pcv2.state, 'open');
      });
    });

    describe('when ice connection monitor detects inactivity', () => {
      let test;

      beforeEach(async () => {
        test = makeTest({ offers: 2 });

        // Do a first round of negotiation.
        await test.pcv2.offer();
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

        // Spy on MockPeerConnection's .createOffer method.
        test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

        assert(inactiveCallback === null);

        // simulate ice connected
        test.pc.iceConnectionState = 'connected';
        test.pc.emit('iceconnectionstatechange');

        assert(typeof inactiveCallback === 'function');

        await oneTick();
        inactiveCallback(); // invoke inactive call back.
        await oneTick();

        // simulate ice disconnected
        test.pc.iceConnectionState = 'disconnected';
        test.pc.emit('iceconnectionstatechange');
        await oneTick();
      });

      it('it initiates iceRestart', () => {
        assert(test.pc.createOffer.calledWith({
          iceRestart: true
        }));
      });

      it('closes the PeerConnectionV2 after the ICE reconnection timeout expires', async () => {
        await new Promise(resolve => test.pcv2.once('stateChanged', resolve));
        assert.equal(test.pcv2.state, 'closed');
      });

      it('does not close the PeerConnectionV2 when the underlying RTCPeerConnection\'s .iceConnectionState transitions to "connected"', async () => {
        // Cause an ICE reconnect.
        test.pc.iceConnectionState = 'connected';
        test.pc.emit('iceconnectionstatechange');

        // Wait for the session timeout period.
        await waitForSometime(test.sessionTimeout);

        assert.equal(test.pcv2.state, 'open');
      });
    });

    describe('when a remote answer is applied after restarting ICE, and then .offer is called again', () => {
      it('the PeerConnectionV2 calls .createOffer on the underlying RTCPeerConnection without setting .iceRestart to true', async () => {
        const test = makeTest({ offers: 3 });

        // Do a first round of negotiation.
        await test.pcv2.offer();
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

        // Then, cause an ICE failure.
        test.pc.iceConnectionState = 'failed';
        test.pc.emit('iceconnectionstatechange');

        await oneTick();

        // Apply a remote answer.
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 2));

        // Spy on MockPeerConnection's .createOffer method.
        test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

        // Create a new offer.
        await test.pcv2.offer();

        // Check .iceRestart is undefined.
        assert(test.pc.createOffer.calledWith({}));
      });
    });

    describe('when glare is detected during an ICE restart', () => {
      it('the PeerConnectionV2 will roll back, answer, and then call .createOffer on the underlying RTCPeerConnection with .iceRestart set to true', async () => {
        const test = makeTest({ offers: 3, answers: 1 });

        // Do a first round of negotiation.
        await test.pcv2.offer();
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

        // Spy on MockPeerConnection's .createOffer method.
        test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

        // Then, cause an ICE failure.
        test.pc.iceConnectionState = 'failed';
        test.pc.emit('iceconnectionstatechange');

        await oneTick();

        // Check .iceRestart is true.
        assert(test.pc.createOffer.calledWith({
          iceRestart: true
        }));

        // Reset the spy.
        test.pc.createOffer.reset();

        // Trigger glare.
        await test.pcv2.update(test.state().setDescription(makeOffer(), 2));

        // Check .iceRestart is true (again).
        assert(test.pc.createOffer.calledWith({
          iceRestart: true
        }));
      });
    });

    describe('when .offer is called during an ICE restart', () => {
      it('the PeerConnectionV2 will wait until ICE is restarted to re-offer', async () => {
        const test = makeTest({ offers: 3, answers: 1 });

        // Do a first round of negotiation.
        await test.pcv2.offer();
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

        // Spy on MockPeerConnection's .createOffer method.
        test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

        // Then, cause an ICE failure.
        test.pc.iceConnectionState = 'failed';
        test.pc.emit('iceconnectionstatechange');

        await oneTick();

        // Check .iceRestart is true.
        assert(test.pc.createOffer.calledWith({
          iceRestart: true
        }));

        // Reset the spy.
        test.pc.createOffer.reset();

        // Call .offer.
        await test.pcv2.offer();

        // Ensure the spy is not called.
        assert.equal(test.pc.createOffer.callCount, 0);

        // Apply a remote answer.
        await test.pcv2.update(test.state().setDescription(makeAnswer(), 2));

        // Check .iceRestart is undefined.
        assert(test.pc.createOffer.calledWith({}));
      });
    });

    [
      'connected',
      'completed'
    ].forEach(iceConnectionState => {
      describe(`when ICE is restarted, the underlying RTCPeerConnection's .iceConnectionState transitions to "${iceConnectionState}", and then back to "failed"`, () => {
        it('the PeerConnectionV2 calls .createOffer on the underyling RTCPeerConnection with .iceRestart set to true', async () => {
          const test = makeTest({ offers: 3, answers: 1 });

          // Do a first round of negotiation.
          await test.pcv2.offer();
          await test.pcv2.update(test.state().setDescription(makeAnswer(), 1));

          // Spy on MockPeerConnection's .createOffer method.
          test.pc.createOffer = sinon.spy(test.pc.createOffer.bind(test.pc));

          // Then, cause an ICE failure.
          test.pc.iceConnectionState = 'failed';
          test.pc.emit('iceconnectionstatechange');

          await oneTick();

          // Check .iceRestart is true.
          assert(test.pc.createOffer.calledWith({
            iceRestart: true
          }));

          // Apply a remote answer, and simulate a successful ICE restart.
          await test.pcv2.update(test.state().setDescription(makeAnswer(), 2));
          test.pc.iceConnectionState = iceConnectionState;
          test.pc.emit('iceconnectionstatechange');

          // Reset the spy.
          test.pc.createOffer.reset();

          // Then, cause an ICE failure (again).
          test.pc.iceConnectionState = 'failed';
          test.pc.emit('iceconnectionstatechange');

          await oneTick();

          // Check .iceRestart is true (again).
          assert(test.pc.createOffer.calledWith({
            iceRestart: true
          }));
        });
      });
    });
  });
});
