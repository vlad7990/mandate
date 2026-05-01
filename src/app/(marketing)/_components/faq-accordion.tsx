"use client";

import { useState } from "react";

export type FaqItem = {
  q: string;
  a: string;
};

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div role="list" className="m-faq">
      {items.map((item, i) => {
        const open = i === openIdx;
        return (
          <div key={i} className="m-faq__item" role="listitem">
            <button
              type="button"
              className="m-faq__btn"
              aria-expanded={open}
              aria-controls={`faq-panel-${i}`}
              onClick={() => setOpenIdx(open ? null : i)}
            >
              <span>{item.q}</span>
              <span className="m-faq__icon" aria-hidden />
            </button>
            <div
              id={`faq-panel-${i}`}
              className="m-faq__panel"
              data-open={open}
              role="region"
            >
              <div className="m-faq__panel-inner">{item.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
