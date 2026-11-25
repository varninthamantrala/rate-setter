const nz = (n: number, d: number): number => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n); // avoid printing -0.0
export const f1 = (n: number): string => nz(n, 1).toFixed(1);
export const f2 = (n: number): string => nz(n, 2).toFixed(2);
export const pct = (n: number, d = 1): string => `${n.toFixed(d)}%`;
export const signed = (n: number, d = 1): string => `${n > 0.0001 ? '+' : n < -0.0001 ? '-' : ''}${Math.abs(n).toFixed(d)}`;
export const cx = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ');
export const bpsText = (n: number): string => `${Math.abs(Math.round(n * 100))} bp`;
