import { useState } from 'react';
import { Mic } from 'lucide-react';
import type { QuarterLog } from '../engine/campaign';

export function Press({ log, onDone }: { log: QuarterLog; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const qa = log.presser[step];
  const last = step >= log.presser.length - 1;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-4" role="dialog" aria-modal="true" aria-label="Press conference">
      <div key={step} className="pointer-events-none fixed inset-0 z-50 animate-bulb bg-white" aria-hidden="true" />
      <div className="relative w-full max-w-xl animate-rise border-4 border-double border-ink bg-paper p-6 shadow-[8px_8px_0_#1a1712]">
        <div className="caps flex items-center gap-2 text-red"><Mic size={14} /> Press conference · Reserve Bank of Verra</div>
        <h2 className="headline mt-2 text-2xl sm:text-3xl">{log.headline}</h2>
        <div className="mt-4 border-t border-ink pt-3">
          <p className="caps text-soft">{qa.who}</p>
          <p className="mt-1 text-lg italic">"{qa.q}"</p>
          <p className="caps mt-4 text-soft">The Governor</p>
          <p className="mt-1 text-lg">"{qa.a}"</p>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="caps text-soft">Question {step + 1} of {log.presser.length}</span>
          <button className="btn btn-solid" autoFocus onClick={() => (last ? onDone() : setStep(step + 1))}>{last ? 'Read tomorrow\'s paper' : 'Next question'}</button>
        </div>
      </div>
    </div>
  );
}
