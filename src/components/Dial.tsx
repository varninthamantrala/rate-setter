import { RATE_MAX } from '../engine/economy';

export function Dial({ value, prev }: { value: number; prev: number }) {
  const cx0 = 100, cy0 = 104, r = 74;
  const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
  const ang = (v: number) => a0 + ((a1 - a0) * v) / RATE_MAX;
  const pt = (a: number, rr: number): [number, number] => [cx0 + rr * Math.cos(a), cy0 + rr * Math.sin(a)];
  const [sx, sy] = pt(a0, r);
  const [vx, vy] = pt(ang(value), r);
  const [nx, ny] = pt(ang(value), r - 14);
  const [px, py] = pt(ang(prev), r + 9);
  const [px2, py2] = pt(ang(prev), r + 2);
  const arcLen = ang(value) - a0;
  const ticks = [];
  for (let i = 0; i <= 24; i++) {
    const a = ang((i * RATE_MAX) / 24);
    const [x1, y1] = pt(a, r + 4);
    const [x2, y2] = pt(a, r + (i % 2 ? 9 : 14));
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a1712" strokeWidth={i % 2 ? 0.8 : 1.6} />);
  }
  const labels = [0, 3, 6, 9, 12].map((v) => {
    const [x, y] = pt(ang(v), r + 26);
    return <text key={v} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#1a1712">{v}</text>;
  });
  return (
    <svg viewBox="0 0 200 190" className="mx-auto block w-full max-w-[250px]" role="img" aria-label={`Policy rate dial: ${value.toFixed(2)} percent`}>
      <circle cx={cx0} cy={cy0} r={r + 34} fill="none" stroke="#1a1712" strokeWidth="1" />
      <path d={`M${sx} ${sy} A${r} ${r} 0 1 1 ${pt(a1, r)[0]} ${pt(a1, r)[1]}`} fill="none" stroke="#cdbf9a" strokeWidth="9" />
      <path d={`M${sx} ${sy} A${r} ${r} 0 ${arcLen > Math.PI ? 1 : 0} 1 ${vx} ${vy}`} fill="none" stroke="#1a1712" strokeWidth="9" />
      {ticks}
      {labels}
      <line x1={px} y1={py} x2={px2} y2={py2} stroke="#8c1d18" strokeWidth="3" />
      <line x1={cx0} y1={cy0} x2={nx} y2={ny} stroke="#8c1d18" strokeWidth="3" />
      <circle cx={cx0} cy={cy0} r="6" fill="#8c1d18" />
      <text x={cx0} y={cy0 + 34} textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="700" fontSize="30" fill="#1a1712">{value.toFixed(2)}%</text>
      <text x={cx0} y={cy0 + 50} textAnchor="middle" fontSize="9" letterSpacing="2" fontWeight="700" fill="#5b5242">POLICY RATE</text>
    </svg>
  );
}
