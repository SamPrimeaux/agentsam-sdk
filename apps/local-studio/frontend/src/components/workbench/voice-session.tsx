import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, Volume2, X } from 'lucide-react';
import { useWorkStore } from '@/lib/work/store';

import { IconAction } from '@/components/ui/icon-action';
/** Browser speech is a capability-gated voice transport; text turns use the existing authenticated AgentSam agent. */
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechError = { error?: string };
export type BrowserSpeechRecognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: SpeechError) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
export function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const host = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return host.SpeechRecognition || host.webkitSpeechRecognition || null;
}
export function canDictate() { return Boolean(speechRecognitionConstructor()); }

/** One-shot dictation; the transcript remains an editable draft and is never submitted automatically. */
export function startDictation(onText: (text: string) => void, onStatus: (status: string) => void): () => void {
  const Constructor = speechRecognitionConstructor();
  if (!Constructor) { onStatus('Dictation is unavailable in this browser.'); return () => {}; }
  const recognition = new Constructor();
  recognition.lang = navigator.language || 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = event => {
    const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    if (text) onText(text);
  };
  recognition.onerror = event => onStatus(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Dictation unavailable: ${event.error || 'speech service error'}`);
  try { recognition.start(); onStatus('Listening for dictation…'); }
  catch { onStatus('Could not start dictation. Check microphone permissions.'); }
  return () => { recognition.onend = null; recognition.onresult = null; recognition.abort(); };
}

export function VoiceSession({ open, onClose, targetId, targetKind }: { open: boolean; onClose: () => void; targetId: string; targetKind: 'chat' | 'side' }) {
  const [phase, setPhase] = useState<'ready' | 'listening' | 'working' | 'speaking' | 'unavailable'>('ready');
  const [status, setStatus] = useState('');
  const [voiceURI, setVoiceURI] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognizer = useRef<BrowserSpeechRecognition | null>(null);
  const live = useRef(false);
  const spoken = useRef('');

  useEffect(() => {
    if (!open) return;
    const sync = () => setVoices(typeof window !== 'undefined' && 'speechSynthesis' in window ? speechSynthesis.getVoices() : []);
    sync();
    if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', sync);
    return () => { if ('speechSynthesis' in window) speechSynthesis.removeEventListener('voiceschanged', sync); };
  }, [open]);

  const stop = () => {
    live.current = false;
    if (recognizer.current) {
      recognizer.current.onend = null;
      recognizer.current.onresult = null;
      recognizer.current.onerror = null;
      recognizer.current.abort();
      recognizer.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.cancel();
    setPhase('ready');
  };
  useEffect(() => () => {
    live.current = false;
    if (recognizer.current) { recognizer.current.onend = null; recognizer.current.abort(); }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.cancel();
  }, []);
  useEffect(() => { if (!open) stop(); }, [open]);

  function listen() {
    if (!live.current) return;
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) { setPhase('unavailable'); setStatus('Your browser does not provide speech recognition.'); return; }
    const recognition = new Constructor();
    recognizer.current = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
      if (!transcript || !live.current) return;
      recognition.onend = null;
      recognition.stop();
      setPhase('working'); setStatus(`You: ${transcript}`);
      void useWorkStore.getState().send(targetId, targetKind, transcript).then(() => {
        if (!live.current) return;
        const state = useWorkStore.getState();
        const items = targetKind === 'chat' ? state.chats.find(item => item.id === targetId)?.messages : state.sideTabs.find(item => item.id === targetId)?.messages;
        const response = [...(items || [])].reverse().find(message => message.role === 'assistant' && message.content.trim());
        if (!response || response.id === spoken.current) { setPhase('ready'); setStatus('No spoken response was returned.'); return; }
        spoken.current = response.id;
        const text = response.content.replace(/```[\s\S]*?```/g, 'Code block omitted.').replace(/[#*_`>\[\]]/g, '').slice(0, 5000).trim();
        if (!text || !('speechSynthesis' in window)) { setPhase('ready'); setStatus('Speech output is unavailable in this browser.'); return; }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = navigator.language || 'en-US';
        utterance.voice = voices.find(voice => voice.voiceURI === voiceURI) || null;
        utterance.onend = () => { if (live.current) { setPhase('listening'); listen(); } };
        utterance.onerror = () => { if (live.current) { setPhase('ready'); setStatus('Speech playback failed. Resume listening to continue.'); } };
        setPhase('speaking'); setStatus('AgentSam is speaking…');
        speechSynthesis.speak(utterance);
      }).catch(error => { if (live.current) { setPhase('ready'); setStatus(error instanceof Error ? error.message : 'Voice turn failed.'); } });
    };
    recognition.onerror = event => { if (!live.current) return; setPhase('ready'); setStatus(event.error === 'not-allowed' ? 'Microphone access denied. Allow microphone access to use voice.' : `Speech recognition stopped: ${event.error || 'unknown error'}`); };
    recognition.onend = () => { if (live.current && recognizer.current === recognition) { setPhase('ready'); setStatus('Recognition stopped. Resume to continue.'); } };
    try { recognition.start(); setPhase('listening'); setStatus('Listening…'); }
    catch { setPhase('ready'); setStatus('Could not start microphone recognition.'); }
  }
  function begin() {
    if (!speechRecognitionConstructor() || !('speechSynthesis' in window)) { setPhase('unavailable'); setStatus('This browser does not support the speech recognition and playback needed for voice.'); return; }
    stop(); live.current = true; listen();
  }
  if (!open) return null;
  return <div className="as-voice-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) { stop(); onClose(); } }}>
    <section className="as-voice-dialog" role="dialog" aria-modal="true" aria-label="AgentSam voice session">
      <header><span><AudioLines size={18}/> AgentSam Voice</span><IconAction type="button" label="Close voice session" onClick={() => { stop(); onClose(); }}><X size={18}/></IconAction></header>
      <div className="as-voice-status" role="status"><span className="as-voice-orb" data-phase={phase} /><strong>{phase === 'listening' ? 'Listening' : phase === 'working' ? 'AgentSam is working' : phase === 'speaking' ? 'Speaking' : phase === 'unavailable' ? 'Unavailable' : 'Ready for voice'}</strong><p>{status || 'Voice exchanges use your selected AgentSam model. Speech services depend on your browser.'}</p></div>
      <label className="as-voice-select"><Volume2 size={15}/> Voice <select aria-label="Choose voice" value={voiceURI} onChange={event => setVoiceURI(event.target.value)}><option value="">System default</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label>
      <div className="as-voice-controls"><button type="button" disabled={phase === 'unavailable' && !canDictate()} onClick={phase === 'ready' || phase === 'unavailable' ? begin : stop}>{phase === 'ready' || phase === 'unavailable' ? <Mic size={16}/> : <MicOff size={16}/>} {phase === 'ready' || phase === 'unavailable' ? 'Start listening' : 'Stop voice'}</button></div>
    </section>
  </div>;
}
