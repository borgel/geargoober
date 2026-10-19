import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export type GuideTopic =
  | 'module'
  | 'pressure-angle'
  | 'teeth'
  | 'ratios'
  | 'layout'
  | 'contact-ratio'
  | 'backlash'
  | 'clearance'
  | 'face-width'
  | 'kerf'
  | 'bores'
  | 'racks'
  | 'escapement';

export const HelpContext = createContext<(topic: GuideTopic) => void>(() => undefined);

/** Small "?" button that opens the gear guide at a topic. */
export function HelpButton({ topic, about }: { topic: GuideTopic; about: string }) {
  const open = useContext(HelpContext);
  return (
    <button
      type="button"
      class="help"
      aria-label={`About ${about}`}
      title={`About ${about}`}
      onClick={(e) => {
        e.preventDefault();
        open(topic);
      }}
    >
      ?
    </button>
  );
}
