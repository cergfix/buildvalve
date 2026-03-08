import * as React from "react";

interface PageHeadProps {
  kicker?: React.ReactNode;
  ver?: React.ReactNode;
  title: React.ReactNode;
  slashed?: boolean;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}

export function PageHead({ kicker, ver, title, slashed, sub, action }: PageHeadProps) {
  return (
    <header className="page-head">
      <div className="page-head-inner">
        {(kicker || ver) && (
          <div className="page-kicker">
            {kicker}
            {ver ? <span className="ver">{ver}</span> : null}
          </div>
        )}
        <h1 className="page-title">
          {slashed ? <span className="slash">/</span> : null}
          {title}
        </h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {action ? <div className="page-head-action">{action}</div> : null}
    </header>
  );
}
