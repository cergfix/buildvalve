type Accent = "emerald" | "amber" | "violet" | "sky";

interface FlowCard {
  title: string;
  sub: string;
  accent: Accent;
}

const cards: FlowCard[] = [
  { title: "Pick a pipeline", sub: "Choose from your allowed list of projects.", accent: "emerald" },
  { title: "Fill variables", sub: "Locked values are injected server-side and never sent to the browser.", accent: "amber" },
  { title: "Launch", sub: "Trigger the run against the chosen ref — staging, main, or a tag.", accent: "violet" },
  { title: "Monitor", sub: "Stream live status, stage progress and job logs via SSE.", accent: "sky" },
];

export function FlowDiagram() {
  return (
    <div className="flow-grid">
      <div className="flow-wire" aria-hidden="true" />
      {cards.map((card, i) => {
        const next = cards[i + 1]?.accent ?? "";
        return (
          <div
            key={card.title}
            className="flow-card box has-accent"
            data-accent={card.accent}
            data-next={next}
          >
            <div className="flow-card-head">
              <span className="flow-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="flow-title">{card.title}</span>
            </div>
            <div className="flow-sub">{card.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
