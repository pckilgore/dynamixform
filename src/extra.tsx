import { assign, createMachine } from "xstate";
type XStateConfig = unknown;

type User = unknown;
type Answer = unknown;

export const establishUserMachine = createMachine({
  id: "establish-user",
  strict: true,
  predictableActionArguments: true,
  preserveActionOrder: true,
  context: {},
  schema: {
    context: {} as { user?: User },
    events: {} as
      | { type: "LOADED"; user: User }
      | { type: "NOT_FOUND" }
      | { type: "HAS_ACCOUNT" }
      | { type: "NEEDS_ACCOUNT" }
      | { type: "SIGN_IN_SUCCESS" }
      | { type: "SIGN_IN_FAIL" }
      | { type: "REGISTER_SUCCESS" }
      | { type: "REGISTER_FAIL" }
  },
  initial: "loading",
  states: {
    loading: {
      on: {
        LOADED: "complete",
        NOT_FOUND: "choosing"
      }
    },
    choosing: {
      on: {
        HAS_ACCOUNT: "signIn",
        NEEDS_ACCOUNT: "registration"
      }
    },
    signIn: {
      on: {
        SIGN_IN_SUCCESS: "complete",
        SIGN_IN_FAIL: "signIn"
      }
    },
    registration: {
      on: {
        REGISTER_SUCCESS: "complete",
        REGISTER_FAIL: "registration"
      }
    },
    complete: {
      type: "final",
      data: (ctx) => ({
        user: ctx.user
      })
    }
  }
});

export const rootMachine = createMachine(
  {
    id: "discovery-manager",
    predictableActionArguments: true,
    preserveActionOrder: true,
    context: {},
    schema: {
      events: {} as
        | { type: "CONTINUE" }
        | { type: "START_FRESH" }
        | { type: "DONE" }
        | { type: "done.invoke.establishUser"; data: { user: User } }
        | { type: "done.invoke.questions"; data: { answers: Answer[] } }
        | { type: "ERROR"; error: { msg: string; err: Error } },
      context: {} as {
        flowConfig?: XStateConfig;
        answers: Answer[];
        user?: User;
      },
      services: {} as {
        questionsMachine: {
          data: { answers: unknown };
        };
        establishUserMachine: {
          data: { user: User };
        };
      }
    },
    initial: "loading",
    states: {
      loading: {
        invoke: {
          src: establishUserMachine,
          id: "establishUser",
          onDone: { target: "welcome", actions: "saveUser" },
          onError: "error"
        },
        on: {
          ERROR: "error"
        }
      },
      welcome: {
        on: {
          CONTINUE: "questions",
          START_FRESH: {
            target: "questions",
            actions: ["clearAnswers"]
          }
        }
      },
      questions: {
        invoke: {
          src: questionsMachine,
          id: "questions",
          data: (ctx) => ({
            answers: ctx.answers
          }),
          onDone: {
            target: "submittingAnswers",
            actions: "saveAnswers"
          }
        }
      },
      submittingAnswers: {
        on: {
          DONE: "nextSteps"
        }
      },
      error: {
        type: "final" // for now
      },
      nextSteps: {
        type: "final"
      }
    }
  },
  {
    actions: {
      saveUser: (ctx, evt) =>
        assign({
          user:
            evt.type === "done.invoke.establishUser" ? evt.data.user : ctx.user
        }),
      clearAnswers: () => assign({ answers: [] }),
      saveAnswers: assign({
        answers: (ctx, evt) => {
          if (evt.type === "done.invoke.questions") {
            return evt.data.answers;
          }
          return ctx.answers;
        }
      })
    },
    services: {
      establishUserMachine
    }
  }
);
