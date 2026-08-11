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
            {/*
              The question is a heading, not a bare button. Eight
              questions were previously absent from the document outline
              entirely, so heading navigation skipped the whole section.
            */}
            <h3 className="m-faq__q">
              <button
                type="button"
                id={`faq-btn-${i}`}
                className="m-faq__btn"
                aria-expanded={open}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpenIdx(open ? null : i)}
              >
                <span>{item.q}</span>
                <span className="m-faq__icon" aria-hidden />
              </button>
            </h3>
            {/*
              `inert` removes a closed panel from the accessibility tree
              and from the tab order. Collapsed panels were only visually
              hidden (max-height: 0; overflow: hidden) while remaining
              display:block and visibility:visible, so a screen reader
              read all eight answers regardless of aria-expanded. `inert`
              is used rather than `hidden` because it does not set
              display:none and so preserves the height transition.
            */}
            <div
              id={`faq-panel-${i}`}
              className="m-faq__panel"
              data-open={open}
              role="region"
              aria-labelledby={`faq-btn-${i}`}
              inert={!open}
            >
              <div className="m-faq__panel-inner">{item.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
