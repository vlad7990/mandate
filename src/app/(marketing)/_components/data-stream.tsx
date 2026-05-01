/**
 * Subtle Matrix-style data stream behind the simulator section.
 *
 * 14 vertical columns of monospace digits/glyphs scrolling downward at
 * varied speeds. ~3% opacity so it reads as atmosphere rather than
 * decoration. Pure CSS animation (transform: translateY only).
 *
 * Hidden on mobile via media query — phones get nothing, both for
 * thermal reasons and because the effect doesn't survive at narrow
 * widths anyway.
 */

const COLUMNS: Array<{
  left: string;
  duration: number;
  delay: number;
  glyphs: string;
}> = [
  { left: "4%", duration: 18, delay: 0, glyphs: "10110100110111010" },
  { left: "11%", duration: 22, delay: 4, glyphs: "▌○●▌◇◆◐◑▌◒◓●◇○" },
  { left: "19%", duration: 16, delay: 2, glyphs: "0001110100110100" },
  { left: "27%", duration: 24, delay: 6, glyphs: "▌▌◐◑▌◒◓●◇○●▌◐◑" },
  { left: "35%", duration: 19, delay: 1, glyphs: "11001011010110101" },
  { left: "43%", duration: 26, delay: 8, glyphs: "◐◑◒◓●○◇◆▌▌◐◑◒◓" },
  { left: "51%", duration: 21, delay: 3, glyphs: "01110010110101100" },
  { left: "59%", duration: 17, delay: 7, glyphs: "▌◇○●◆▌◐◑◒◓●○◇◆" },
  { left: "67%", duration: 23, delay: 5, glyphs: "10010111010011010" },
  { left: "75%", duration: 20, delay: 9, glyphs: "○●◇◆▌◐◑◒◓●○◇◆▌" },
  { left: "83%", duration: 18, delay: 2, glyphs: "01101110010110011" },
  { left: "91%", duration: 25, delay: 6, glyphs: "▌◐◑◒◓●○◇◆▌▌◐◑◒" },
  { left: "97%", duration: 22, delay: 10, glyphs: "10110010110111010" },
  { left: "1%", duration: 27, delay: 11, glyphs: "◆▌◐◑◒◓●○◇◆▌▌◐◑" },
];

export function DataStream() {
  return (
    <div className="m-stream" aria-hidden>
      {COLUMNS.map((c, i) => (
        <span
          key={i}
          className="m-stream__col"
          style={{
            left: c.left,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          {/* Repeat the glyph string twice so the column always has
              content visible during the translateY loop without a
              visible seam. */}
          {c.glyphs.split("").map((g, j) => (
            <span key={j} className="m-stream__glyph">
              {g}
            </span>
          ))}
          {c.glyphs.split("").map((g, j) => (
            <span key={`r${j}`} className="m-stream__glyph">
              {g}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
