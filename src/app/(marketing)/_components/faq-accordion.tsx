export type FaqItem = {
  q: string;
  a: string;
};

/**
 * FAQ disclosure, built on native <details>/<summary>.
 *
 * This was a client component driving `aria-expanded`, `aria-controls`,
 * `inert` and a `max-height` transition from React state. It worked
 * with JavaScript and not at all without it: the server-rendered HTML
 * shipped one open panel and seven carrying `inert`, so a no-JS
 * visitor, a crawler, or anyone whose hydration stalled could read
 * exactly one of eight answers and had no way to open the rest. The
 * text was in the DOM the whole time, sitting at `max-height: 0`.
 *
 * Native <details> fixes the category rather than the instance:
 *
 * - Works with zero JavaScript. This component no longer ships any.
 * - Keyboard and screen-reader behaviour come from the platform, so
 *   there is no expanded/inert state left to fall out of sync.
 * - `name` makes the group exclusive — one open at a time — natively.
 *   Browsers without it simply allow several open, which is a fine
 *   degradation rather than a broken control.
 *
 * The question stays an <h3> inside the <summary> so the eight
 * questions remain in the document outline; assistive tech announces
 * them as heading + disclosure.
 *
 * No open/close animation: <details> hides its content with
 * `display: none`, so a height transition would need `interpolate-size`
 * and buy very little. Dropping it also removes eight
 * `transition: max-height` layout-thrash warnings.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="m-faq">
      {items.map((item, i) => (
        <details
          key={item.q}
          className="m-faq__item"
          name="mandate-faq"
          // Opening the first is a deliberate hint that these expand.
          open={i === 0}
        >
          <summary className="m-faq__btn">
            <h3 className="m-faq__q">{item.q}</h3>
            <span className="m-faq__icon" aria-hidden />
          </summary>
          <div className="m-faq__panel-inner">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
