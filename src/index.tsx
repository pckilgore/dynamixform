import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { inspect } from "@xstate/inspect";
import { useMachine } from "@xstate/react";
import {
  assign,
  interpret,
  createMachine,
  MachineConfig,
  Interpreter
} from "xstate";

import "./styles.css";

const simpleQuestion: MachineConfig<any, any, any> = {
  id: "sample-question-simple",
  strict: true,
  predictableActionArguments: true,
  preserveActionOrder: true,
  initial: "name",
  states: {
    name: {
      meta: {
        id: "name",
        label: "What is your name",
        description: "...",
        type: "input"
      },
      on: {
        SUBMIT: {
          target: "completed",
          actions: "saveAnswer"
        },
        GO_BACK: {
          target: "quit"
        }
      }
    },
    quit: {
      type: "final",
      data: { value: "quit" }
    },
    completed: {
      type: "final",
      data: { value: "complete" }
    }
  }
};
const treeQuestion: MachineConfig<any, any, any> = {
  id: "sample-question-tree",
  strict: true,
  predictableActionArguments: true,
  preserveActionOrder: true,
  initial: "a",
  states: {
    a: {
      meta: {
        id: "abc",
        label: "Can I kick it?",
        description: "...",
        type: "branch",
        labels: {
          PICK_B: "Yes you can!",
          PICK_C: "No you can't!",
          GO_BACK: "Previous question"
        }
      },
      on: {
        PICK_B: {
          target: "b",
          actions: "saveAnswer"
        },
        PICK_C: {
          target: "c",
          actions: "saveAnswer"
        },
        GO_BACK: {
          target: "completed",
          actions: "previousQuestion"
        }
      }
    },
    b: {
      meta: {
        id: "def",
        label: "Go on then...",
        description: "...",
        type: "input"
      },
      on: {
        SUBMIT: {
          target: "completed",
          actions: "saveAnswer"
        },
        GO_BACK: {
          target: "a"
        }
      }
    },
    c: {
      meta: {
        id: "ghi",
        label: "Well I'm gone!",
        description: "...",
        type: "branch",
        labels: {
          OK: "Fine",
          GO_BACK: "Wait a minute..."
        }
      },
      on: {
        OK: {
          target: "completed",
          actions: "saveAnswer"
        },
        GO_BACK: {
          target: "a",
          actions: "update"
        }
      }
    },
    completed: {
      type: "final",
      data: { value: "complete" }
    }
  }
};

const questionsMachine = createMachine({
  id: "questions-machine",
  strict: true,
  predictableActionArguments: true,
  preserveActionOrder: true,
  context: {
    // If you set this context key via a backend query....
    // It's just JSON!
    pods: [simpleQuestion, treeQuestion],
    progress: 0,
    answers: {}
  },
  schema: {
    context: {} as {
      pods: MachineConfig<any, any, any>[];
      progress: number;
      answers: Record<string, unknown>;
      activeQuestionService?: Interpreter<any>;
    },
    events: {} as
      | { type: "DONE" }
      | { type: "NEXT" }
      | { type: "PREVIOUS" }
      | { type: "UPDATE" } // to trigger a react re-render
      | { type: "LOAD_NEW_QUESTION"; service: Interpreter<any> }
      | { type: "ANSWER"; questionId: string; answer: unknown }
  },
  initial: "play",
  states: {
    play: {
      invoke: {
        id: "opaque-machine-invoker",
        src: (ctx) => (sendToParent) => {
          const machineConfig =
            ctx.pods.length >= ctx.progress ? ctx.pods[ctx.progress] : null;
          if (!machineConfig) {
            return sendToParent("DONE");
          }

          const machine = createMachine(machineConfig, {
            actions: {
              update: () => sendToParent("UPDATE"),
              previousQuestion: () => sendToParent("PREVIOUS"),
              saveAnswer: (ctx, questionEvent) => {
                sendToParent({
                  type: "ANSWER",
                  questionId: questionEvent.questionId,
                  answer: questionEvent.answer
                });
              }
            }
          });
          const service = interpret(machine, { devTools: true })
            .start()
            .onDone((evt) => {
              evt.data.value === "complete"
                ? sendToParent("NEXT")
                : sendToParent("PREVIOUS");
            });

          // @ts-expect-error because we can't be typesafe with dynamic machines
          sendToParent({ type: "LOAD_NEW_QUESTION", service });
        }
      },
      on: {
        UPDATE: {
          actions: (c) => assign({ progress: c.progress })
        },
        PREVIOUS: {
          actions: assign({
            progress: (ctx) =>
              ctx.progress > 0 ? ctx.progress - 1 : ctx.progress,
            activeQuestionService: undefined
          }),
          target: "play"
        },
        LOAD_NEW_QUESTION: {
          actions: assign({
            activeQuestionService: (c, e) =>
              e.type === "LOAD_NEW_QUESTION"
                ? e.service
                : c.activeQuestionService
          })
        },
        ANSWER: {
          actions: [
            assign({
              answers: (c, e) =>
                e.type === "ANSWER"
                  ? { ...c.answers, [e.questionId]: e.answer }
                  : c.answers
            })
          ]
        },
        NEXT: {
          actions: assign({
            progress: (ctx) => ctx.progress + 1,
            activeQuestionService: undefined
          }),
          target: "play"
        },
        DONE: "complete"
      }
    },
    complete: {
      type: "final"
    }
  }
});

function MyMachine() {
  const [state] = useMachine(questionsMachine, { devTools: true });
  const activeQuestion = state.context.activeQuestionService;
  const questionState = state.context.activeQuestionService?.getSnapshot();
  const peek = (
    <section
      style={{
        backgroundColor: "rebeccapurple",
        color: "white",
        padding: "1em",
        height: 300,
        overflow: "scroll"
      }}
    >
      <h2>State</h2>
      <pre>{JSON.stringify(state.context.answers, null, 2)}</pre>
    </section>
  );

  if (!questionState || !activeQuestion) {
    return peek;
  }
  const currentQuestion = questionState.value.toString();
  const meta = questionState.meta[`${activeQuestion.id}.${currentQuestion}`];
  const nextEvents = questionState.nextEvents ?? [];

  const defaults: Record<string, string> = {
    SUBMIT: "Submit",
    GO_BACK: "Go back"
  };

  console.log("rerender", questionState.value);

  let children =
    ({
      branch: (
        <>
          <label key={questionState.value.toString()}>{meta.label}</label>
          {nextEvents.map((action) => (
            <button
              key={action}
              type="button"
              onClick={(e) => {
                console.log("clicked", action);
                activeQuestion.send({
                  type: action,
                  questionId: currentQuestion,
                  answer: action
                });
              }}
            >
              {meta?.labels?.[action] ??
                defaults[action] ??
                action.toLowerCase()}
            </button>
          ))}
        </>
      ),
      input: (
        <form
          key={state.value.toString()}
          onSubmit={(e) => {
            e.preventDefault();
            activeQuestion.send({
              type: "SUBMIT",
              questionId: currentQuestion,
              answer: e.target[currentQuestion].value
            });
          }}
        >
          <label>
            {meta.label}
            <input
              name={currentQuestion}
              defaultValue={state.context.answers[currentQuestion]}
              title={meta.description}
            />
          </label>
          <button type="submit">Submit</button>
          <button type="button" onClick={() => activeQuestion.send("GO_BACK")}>
            Go Back
          </button>
        </form>
      )
    } as Record<string, React.ReactNode>)[meta?.type as string] ?? null;

  return (
    <>
      <div style={{ padding: "1em" }}>
        <h2>Form</h2>
        {children}
      </div>
      {peek}
    </>
  );
}

function App() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const inspector = inspect();
    setTimeout(() => setReady(true), 500);
    return () => inspector?.disconnect();
  }, []);

  const reset = () => {
    setReady(false);
    setTimeout(() => setReady(true), 100);
  };

  return (
    <>
      {!ready ? <h1>Connecting!</h1> : null}
      <button type="button" onClick={reset}>
        Reset
      </button>
      <section style={{ height: 300, width: "100%" }}>
        {ready ? <MyMachine /> : null}
      </section>
      <iframe title="xstate/inspect" data-xstate />
    </>
  );
}

const rootElement = document.getElementById("root");
createRoot(rootElement).render(<App />);
