import type { NodeKind } from './types';

/** Privilege levels the player can hold in a system, lowest to highest. */
export type Privilege = 'worker' | 'security' | 'admin' | 'overseer';

export interface NodeAction {
  /** Command name, typed as "do <id>". */
  id: string;
  /** One line shown in look and in the menu. */
  help: string;
  /** Privilege needed to use it, if any. */
  requires?: Privilege;
  /**
   * What happens for now. Most actions are placeholders that only print text;
   * the real effect comes when the systems behind them exist.
   */
  result: string;
}

const a = (id: string, help: string, result: string, requires?: Privilege): NodeAction => ({ id, help, result, requires });

/** Actions each node kind offers to a player standing in it. */
export const NODE_ACTIONS: Partial<Record<NodeKind, NodeAction[]>> = {
  identity: [
    a('steal-privilege', 'take over the privilege this service grants', 'no privilege to take yet (privileges come later)'),
    a('revoke-user', "revoke a specific user's access", 'no users to revoke yet'),
  ],
  uplink: [
    a('jump', 'cross to the system on the other end', 'the other end of this uplink is not known yet'),
    a('sniff', 'listen to the traffic and learn about the other system', 'nothing useful in the traffic yet'),
    a('isolate', 'cut traffic to the other system: no alarms and no agents get through', 'uplink isolated: alarms and agents will not pass through (alarms and agents come later)'),
  ],
  database: [
    a('query', 'search the data for something valuable', 'nothing valuable found (files come later)'),
    a('download', 'copy data out', 'nothing to download yet'),
    a('delete', 'destroy data', 'nothing to delete yet'),
    a('alter', 'change a record', 'nothing to alter yet'),
  ],
  vault: [a('extract-keys', 'take the keys: decrypting in this system gets easier', 'no keys yet (encryption comes later)')],
  overseer: [
    a('download-map', 'get the map of the whole system', ''),
    a('backdoor', 'leave a way in: next run starts deep inside this system', 'backdoor placed (backdoors come later)'),
    a('cancel-shutdown', 'stop a system shutdown in progress', 'no system shutdown in progress'),
    a('cancel-alarm', 'lower the alarm', 'alarm lowered (alarms come later)', 'overseer'),
  ],
  orchestrator: [a('block-respawn', 'destroyed agents stop coming back', 'agent respawn blocked (agents come later)')],
  monitoring: [
    a('wipe-logs', 'erase traces of this run', 'logs wiped (attribution comes later)'),
    a('remove-trace', 'remove a completed trace', 'no completed trace to remove'),
    a('cancel-alert', 'cancel an alert', 'alert cancelled', 'admin'),
  ],
  compute: [
    a('borrow-compute', 'use spare compute: your programs run faster for a while', 'nothing to speed up yet (programs come later)'),
    a('overload', 'take the whole system down for a while', 'overload needs a special contract or software'),
  ],
  camera: [
    a('loop', 'cameras show a recording on loop', 'cameras looped'),
    a('disable', 'switch the cameras off (fast, but suspicious)', 'cameras disabled'),
    a('view', 'watch the feeds (can help with a contract)', 'nothing of interest on the feeds'),
  ],
  physical: [
    a('open-doors', 'open the doors', 'doors opened'),
    a('close-doors', 'close the doors', 'doors closed'),
    a('lock-doors', 'lock the doors', 'doors locked'),
    a('fire-alarm', 'set off the fire alarm', 'fire alarm triggered'),
    a('lock-elevator', 'lock the elevator', 'elevator locked'),
    a('unlock-elevator', 'unlock the elevator', 'elevator unlocked'),
  ],
  vehicle: [
    a('redirect', 'send a vehicle somewhere else', 'no vehicle on the move'),
    a('stop', 'stop the fleet', 'fleet stopped'),
  ],
  security: [
    a('disarm', 'switch off the sensors in an area', 'sensors disarmed'),
    a('fake-trigger', 'set off an alarm somewhere else to draw the guards away', 'alarm triggered on another floor'),
  ],
};

/** The actions a node of this (visible) kind offers. */
export function actionsFor(kind: NodeKind): NodeAction[] {
  return NODE_ACTIONS[kind] ?? [];
}
