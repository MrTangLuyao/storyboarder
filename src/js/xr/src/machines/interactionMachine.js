const { Machine } = require('xstate')
const { assign } = require('xstate/lib/actions')

const { log } = require('../components/Log')

const machine = Machine({
  id: 'interactions',
  strict: true,
  initial: 'idle',
  context: {
    miniMode: false,
    snap: false,
    selection: null,
    draggingController: null, // TODO draggables[]
    teleportDragController: null
  },
  states: {
    idle: {
      on: {
        // TODO move to onEntry?
        // idle always clears the selection if it is present
        '': {
          cond: 'selectionPresent',
          actions: ['clearDraggingController', 'clearSelection', 'onSelectNone']
        },
        TRIGGER_START: [
          // skip immediately to the drag behavior for objects and characters
          {
            cond: 'eventHasObjectOrCharacterIntersection',
            target: 'drag_object',
            actions: ['updateDraggingController', 'updateSelection', 'onSelected']
          },
        ],
        GRIP_DOWN: [
          {
            cond: 'eventHasObjectOrCharacterIntersection',
            target: 'selected',
            actions: ['updateSelection', 'onSelected']
          },
          {
            actions: ['updateTeleportDragController'],
            target: 'drag_teleport'
          }
        ],
        AXES_CHANGED: {
          actions: ['moveAndRotateCamera']
        }
      }
    },
    selected: {
      on: {
        TRIGGER_START: [
          {
            target: 'idle',
            cond: 'selectionNil'
          },
          // if we select a bone, don't do anything
          {
            cond: 'eventHasBoneIntersection'
          },

          // anything selected that's not a bone can be dragged
          {
            actions: ['updateDraggingController', 'updateSelection', 'onSelected'],
            target: 'drag_object'
          },
        ],

        GRIP_DOWN: [
          {
            cond: 'eventHasBoneIntersection',
            target: 'rotate_bone'
          },
          {
            cond: 'eventHasObjectOrCharacterIntersection',
            target: 'selected',
            actions: ['updateSelection', 'onSelected']
          },
          {
            actions: ['updateTeleportDragController'],
            target: 'drag_teleport'
          }
        ],

        AXES_CHANGED: {
          actions: ['moveAndRotateCamera']
        }
      }
    },
    drag_object: {
      onEntry: 'onDragObjectEntry',
      onExit: ['onSnapEnd', 'onDragObjectExit'],
      on: {
        TRIGGER_END: {
          cond: 'controllerSame',
          target: 'selected'
        },

        AXES_CHANGED: {
          actions: ['moveAndRotateObject']
        },

        GRIP_DOWN: {
          cond: 'controllerSame',
          actions: 'onSnapStart'
        },
        GRIP_UP: {
          cond: 'controllerSame',
          actions: 'onSnapEnd'
        }
      }
    },
    drag_teleport: {
      onEntry: 'onDragTeleportStart',
      on: {
        // if you press the trigger on the teleporting controller
        TRIGGER_START: {
          cond: 'eventControllerMatchesTeleportDragController',
          actions: ['onTeleport']
        },
        GRIP_DOWN: {
          cond: 'bothGripsDown',
          actions: (context, event) => { log('MINI MODE!') }
        },
        GRIP_UP: [
          {
            cond: 'eventControllerNotTeleportDragController',
            actions: (context, event) => { log('! ignoring GRIP_UP during drag_teleport') }
          },
          {
            // if there is a selection, go back to the selected state
            cond: 'selectionPresent',
            actions: ['onDragTeleportEnd', 'clearTeleportDragController'],
            target: 'selected'
          }, {
            // otherwise, go to the idle state
            actions: ['onDragTeleportEnd', 'clearTeleportDragController'],
            target: 'idle'
          }
        ],
        AXES_CHANGED: {
          actions: ['moveAndRotateCamera']
        }
      },
    },
    rotate_bone: {
      onEntry: ['updateDraggingController', 'onRotateBoneEntry'],
      onExit: ['onRotateBoneExit', 'clearDraggingController'],
      on: {
        GRIP_UP: {
          cond: 'controllerSame',
          target: 'selected'
        }
      }
    }
  }
}, {
  actions: {
    // TODO simplify these
    updateSelection: assign({
      selection: (context, event) => event.intersection.id
    }),
    clearSelection: assign({
      selection: (context, event) => null
    }),

    updateDraggingController: assign({
      draggingController: (context, event) => event.controller.gamepad.index
    }),
    clearDraggingController: assign({
      draggingController: (context, event) => null
    }),

    updateTeleportDragController: assign({
      teleportDragController: (context, event) => event.controller.gamepad.index
    }),
    clearTeleportDragController: assign({
      teleportDragController: (context, event) => null
    }),
  },
  guards: {
    selectionPresent: (context, event) => context.selection != null,
    selectionNil: (context, event) => event.intersection == null,

    eventHasObjectOrCharacterIntersection: (context, event) => event.intersection != null && ['object', 'character'].includes(event.intersection.type),
    eventHasBoneIntersection: (context, event) => event.intersection != null && event.intersection.bone,

    eventControllerMatchesTeleportDragController: (context, event) => event.controller.gamepad.index === context.teleportDragController,
    eventControllerNotTeleportDragController: (context, event) => event.controller.gamepad.index !== context.teleportDragController,

    bothGripsDown: (context, event) => event.controller.gamepad.index !== context.teleportDragController,

    controllerSame: (context, event) => event.controller.gamepad.index === context.draggingController
  }
})

module.exports = machine
