import { useState } from 'react';
import { ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { LiveAlert, Selection, SubnetData } from '../types';
import { fmtDateTime, flagEmoji } from '../utils/format';

interface AlertFeedProps {
  data: SubnetData;
  onSelect: (selection: Selection) => void;
}

const SEVERITY_STYLES: Record<LiveAlert['severity'], string> = {
  critical: 'border-red-400/60 bg-red-500/15 text-red-100',
  high: 'border-orange-400/50 bg-orange-500/10 text-orange-100',
  medium: 'border-amber-400/40 bg-amber-400/5 text-amber-100',
};

export default function AlertFeed({ data, onSelect }: AlertFeedProps) {
  const [open, setOpen] = useState(true);
  const known = new Set(data.countries.map((c) => c.iso2));

  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-3 z-10 w-[calc(100%-1.5rem)] max-w-[340px] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2">
        <span className="hud-label flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 animate-pulse text-neon-red" />
          Flux BGP / IODA · {data.alerts.length} alerte(s)
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto px-2 pb-2">
          {data.alerts.length === 0 && <li className="px-1 py-2 text-xs text-emerald-300/80">Aucune anomalie significative détectée.</li>}
          {data.alerts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => known.has(a.iso2) && onSelect({ type: 'country', id: a.iso2 })}
                className={`w-full rounded-lg border px-2 py-1.5 text-left ${SEVERITY_STYLES[a.severity]} ${known.has(a.iso2) ? 'hover:brightness-125' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">
                    {flagEmoji(a.iso2)} {a.countryName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] opacity-70">{a.source}</span>
                </div>
                <div className="text-[11px] opacity-80">{a.title}</div>
                <div className="font-mono text-[10px] opacity-50">depuis {fmtDateTime(a.start)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-white/5 px-3 py-1.5 font-mono text-[10px] text-slate-500">
        Données du {fmtDateTime(data.meta.generatedAt)}
      </div>
    </div>
  );
}
