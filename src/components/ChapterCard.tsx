import type { ChapterDef } from '../engine/campaign';

export function ChapterCard({ chapter, onBegin }: { chapter: ChapterDef; onBegin: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-ink/85 p-4" role="dialog" aria-modal="true" aria-label={`${chapter.kicker}: ${chapter.title}`}>
      <div className="w-full max-w-2xl animate-rise border-4 border-double border-ink bg-paper p-6 text-center shadow-[8px_8px_0_#1a1712] sm:p-8">
        <div className="caps text-red">Extra! Extra! · {chapter.kicker}</div>
        <h2 className="headline mt-2 text-4xl sm:text-5xl">{chapter.title}</h2>
        <p className="mx-auto mt-4 max-w-prose text-left text-lg leading-snug drop">{chapter.blurb}</p>
        <p className="caps mt-4 text-soft">New on your desk: {chapter.unlocks}</p>
        <p className="caps mt-1 text-soft">Quarters {chapter.from} to {chapter.to}</p>
        <button className="btn btn-solid mt-6 !px-6 !py-3 text-base" autoFocus onClick={onBegin}>Take your seat</button>
      </div>
    </div>
  );
}
