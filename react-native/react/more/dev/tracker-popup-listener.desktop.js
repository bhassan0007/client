'use strict'
/* @flow */

// $FlowIssue with platform components
import React, {Component} from '../../base-react'
import Tracker from '../../tracker'

import engine from '../../engine'
import { createServer } from '../../engine/server'
import { flattenCallMap, promisifyResponses } from '../../engine/call-map-middleware'

import * as _ from 'lodash'

import type {IdentifyKey, TrackSummary, Identity, RemoteProof, LinkCheckResult, Cryptocurrency, IdentifyOutcome, User, UserSummary} from '../../constants/types/flow-types'

import { identify } from '../../keybase_v1.js'

import type { BioProps } from '../../tracker/bio.render.desktop'
import type { ActionProps } from '../../tracker/action.render.desktop'
import type { HeaderProps } from '../../tracker/header.render.desktop'
import type { ProofsProps, ProofsAndChecks } from '../../tracker/proofs.render.desktop'
import type { TrackerProps } from '../../tracker/render.desktop'
import type { SimpleProofState } from '../../tracker/common-types'

type ComponentState = {
  outstandingReqs: Array<RemoteProof>,
  overallProofStatus: SimpleProofState,
  bioProps: BioProps,
  actionProps: ActionProps,
  headerProps: HeaderProps,
  proofsProps: ProofsProps
}

export default class TrackerPopupListener extends Component {

  // TODO's
  // * Get reason from the service
  // * Get UserInfo (for BioProps)
  //

  state: ComponentState;

  // Get some type safety here
  setState (object: ComponentState): void {
    super.setState(object)
  }

  constructor (props: {}) {
    super(props)
    const overallProofStatus = 'pending'
    this.state = {
      outstandingReqs: [],
      overallProofStatus,
      bioProps: {
        username: null,
        state: overallProofStatus,
        userInfo: {
          fullname: 'TODO: get this information',
          followersCount: -1,
          followingCount: -1,
          followsYou: false,
          avatar: 'TODO: get this information',
          location: 'TODO: get this information'
        }
      },

      actionProps: {
        state: overallProofStatus,
        username: null,
        shouldFollow: true,
        onClose: () => {
          console.log('onClose')
        }, // TODO
        onRefollow: () => {
          console.log('onRefollow')
        },
        onUnfollow: () => {
          console.log('onUnfollow')
        },
        onFollowHelp: () => window.open('https://keybase.io/docs/tracking'), // TODO
          // followChecked: checked => this.setState({shouldFollowChecked: checked})
        followChecked: checked => console.log('follow checked:', checked)
      },

      headerProps: {
        reason: 'TODO: get this information',
        onClose: () => {
          // TODO
          console.log('onClose from header')
        }
      },

      proofsProps: {
        proofsAndChecks: []
      }
    }
  }

  updateProofsAndChecks (rp: RemoteProof, lcr: LinkCheckResult): void {
    const oldProofsAndChecks = this.state.proofsProps.proofsAndChecks
    const proofsAndChecks = oldProofsAndChecks.map(proofAndCheck => {
      const [p] = proofAndCheck
      if (_.isEqual(p, rp)) {
        return [p, lcr]
      }
      return proofAndCheck
    })
    this.setState({
      ...this.state,
      proofsProps: {
        ...this.state.proofsProps,
        proofsAndChecks
      }
    })
  }

  updateOverallProofStatus (proofsAndChecks: ProofsAndChecks): void {
    const allOk: boolean = proofsAndChecks.reduce((acc, [p, lcr]) => {
      if (!lcr) {
        return false
      }
      return acc && lcr.proofResult.state === identify.ProofState.ok
    }, true)

    // TODO figure out the logic for what is a warning and what is an error
    const allWarningsOrOk: boolean = proofsAndChecks.reduce((acc, [p, lcr]) => {
      if (!lcr) {
        return true
      }
      return acc && (lcr.proofResult.state === identify.ProofState.ok ||
                     lcr.proofResult.state === identify.ProofState.tempFailure)
    }, true)

    const anyError: boolean = proofsAndChecks.reduce((acc, [p, lcr]) => {
      if (!lcr) {
        return false
      }
      const isOk: boolean = lcr.proofResult.state === identify.ProofState.ok
      const isTempFailure: boolean = lcr.proofResult.state === identify.ProofState.tempFailure

      return acc || !(isOk || isTempFailure)
    }, false)

    const anyPending: boolean = proofsAndChecks.reduce((acc, [p, lcr]) => acc || !lcr, false)

    let overallProofStatus: SimpleProofState = 'error'

    if (allOk) {
      overallProofStatus = 'normal'
    } else if (allWarningsOrOk) {
      overallProofStatus = 'warning'
    } else if (anyError) {
      overallProofStatus = 'error'
    } else if (anyPending) {
      overallProofStatus = 'pending'
    }

    this.setState({
      ...this.state,
      overallProofStatus,
      bioProps: {
        ...this.state.bioProps,
        state: overallProofStatus
      },
      actionProps: {
        ...this.state.actionProps,
        state: overallProofStatus
      }
    })
  }

  componentWillMount () {
    // TODO Move this to where we spawn a new window for tracker popups
    engine.rpc('delegateUiCtl.registerIdentifyUI', {}, {}, (error, response) => {
      if (error != null) {
        console.error('error in registering identify ui: ', error)
      } else {
        console.log('Registered identify ui')
      }
    })

    const serverCallMapFn = params => {
      const loadUserInfo = uid => {
        engine.rpc('user.loadUncheckedUserSummaries', {uids: [uid]}, {}, (error: ?any, response: Array<UserSummary>) => {
          if (error) {
            console.log(error)
            return
          }

          const onlyUser: ?UserSummary = response[0]
          if (!onlyUser) {
            console.log('Did not get back a user summary')
            return
          }

          console.log('Got back user Summary: ', onlyUser)

          this.setState({
            ...this.state,
            bioProps: {
              ...this.state.bioProps,
              userInfo: {
                fullname: onlyUser.fullName,
                avatar: onlyUser.thumbnail,
                location: 'TODO: get location data',
                // TODO: get this data from somewhere
                followersCount: -1,
                followingCount: -1,
                followsYou: false
              }
            }

          })
          onlyUser.thumbnail
        })
      }

      // setup the callmap
      const identifyUi = {
        start: (params: {sessionID: number, username: string}) => {
          const {username} = params
          this.setState({
            ...this.state,
            bioProps: {
              ...this.state.bioProps,
              username
            },
            actionProps: {
              ...this.state.actionProps,
              username
            }
          })
          console.log('starting identify ui server instance')
        },
        displayKey: (params: {sessionID: number, key: IdentifyKey}) => {
          console.log('displaying key', params)
        },
        reportLastTrack: (params: {sessionID: number, track: ?TrackSummary}) => {
          console.log('Report last track', params)
        },

        launchNetworkChecks: (params: {sessionID: number, identity: Identity, user: User}) => {
          console.log('launch network checks', params)
          // This is the first spot that we have access to the user, so let's use that to get
          // The user information
          loadUserInfo(params.user.uid)

          const proofsAndChecks: ProofsAndChecks = params.identity.proofs.map(p => [p.proof, null])
          this.setState({
            ...this.state,
            proofsProps: {
              ...this.state.proofsProps,
              proofsAndChecks
            }})
        },

        displayTrackStatement: (params: {sessionID: number, stmt: string}) => {
          console.log('display track statements', params)
        },

        finishWebProofCheck: (params: {sessionID: number, rp: RemoteProof, lcr: LinkCheckResult}) => {
          this.updateProofsAndChecks(params.rp, params.lcr)
          console.log('finish web proof', params)
        },
        finishSocialProofCheck: (params: {sessionID: number, rp: RemoteProof, lcr: LinkCheckResult}) => {
          this.updateProofsAndChecks(params.rp, params.lcr)
          console.log('finish social proof', params)
        },
        displayCryptocurrency: (params: {sessionID: number, c: Cryptocurrency}) => {
          console.log('finish displayCryptocurrency', params)
        },
        reportTrackToken: (params: {sessionID: number, trackToken: string}) => {
          console.log('finish report track token', params)
        },
        confirm: (params: {sessionID: number, outcome: IdentifyOutcome}): bool => {
          console.log('confirm', params)
          return false
        },
        finish: (params: {sessionID: number}) => {
          // Check if there were any errors in the proofs
          const proofsAndChecks = this.state.proofsProps.proofsAndChecks
          this.updateOverallProofStatus(proofsAndChecks)
          console.log('finish', params)
        }
      }

      return promisifyResponses(flattenCallMap({ keybase: { '1': { identifyUi } } }))
    }

    createServer(
      engine,
      'keybase.1.identifyUi.delegateIdentifyUI',
      'keybase.1.identifyUi.finish',
      serverCallMapFn
    )
  }

  render (): ReactElement {
    const trackerProps: TrackerProps = {
      headerProps: this.state.headerProps,
      bioProps: this.state.bioProps,
      proofsProps: this.state.proofsProps,
      actionProps: this.state.actionProps
    }

    return <Tracker {...trackerProps}/>
  }
}
