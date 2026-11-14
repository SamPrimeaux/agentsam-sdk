import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, Compass, PawPrint, Sparkles } from 'lucide-react';
import { CompanionProvider, useCompanionSettings } from '../../../agentsam/CompanionContext';
import { resolveCompanion } from '../../../agentsam/companions';
import {
  COMPANION_QUIZ_QUESTIONS,
  recommendCompanionFromQuiz,
  type CompanionQuizAnswers,
} from '../../../agentsam/companion-ecosystem';

export const Route = createFileRoute('/onboarding/companion')({ component: CompanionOnboardingRoute });

function CompanionOnboardingRoute() {
  return <CompanionProvider><CompanionOnboardingWizard /></CompanionProvider>;
}

function CompanionOnboardingWizard() {
  const navigate = useNavigate();
  const { settings, save, loading, saving, error } = useCompanionSettings();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<CompanionQuizAnswers>({});
  const [showResult, setShowResult] = useState(false);
  const [saveError, setSaveError] = useState('');
  const question = COMPANION_QUIZ_QUESTIONS[step];
  const recommendationId = useMemo(() => recommendCompanionFromQuiz(answers), [answers]);
  const recommendation = resolveCompanion(recommendationId);
  const canContinue = Boolean(answers[question?.id || '']);

  function continueQuiz() {
    if (!canContinue) return;
    if (step === COMPANION_QUIZ_QUESTIONS.length - 1) setShowResult(true);
    else setStep((current) => Math.min(current + 1, COMPANION_QUIZ_QUESTIONS.length - 1));
  }

  async function chooseMatch() {
    setSaveError('');
    try {
      await save({
        ...settings,
        activeId: recommendationId,
        secondaryId: settings.secondaryId === recommendationId ? null : settings.secondaryId,
        desktopBuddyEnabled: settings.secondaryId !== recommendationId && settings.desktopBuddyEnabled,
        onboarding: {
          version: '1',
          completedAt: new Date().toISOString(),
          recommendedId: recommendationId,
          answers,
        },
      });
      await navigate({ to: '/' });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Your companion match could not be saved.');
    }
  }

  return <main className="min-h-screen bg-[#0b100d] px-4 py-8 text-[#f4f5ef] sm:px-8 sm:py-12">
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center">
      <header className="mb-8 flex items-center justify-between gap-4">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-white/80 hover:text-white">
          <span className="grid size-8 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/10"><PawPrint className="size-4 text-emerald-200" /></span>
          InnerAnimal
        </a>
        <span className="text-[10px] uppercase tracking-[.22em] text-white/40">Companion setup</span>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111a14] shadow-2xl shadow-black/30">
        <div className="border-b border-white/10 px-6 py-6 sm:px-9 sm:py-8">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-300"><Compass className="size-3.5" /> Discover your InnerAnimal</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Find the companion that fits how you work.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Four quick questions help choose a starting companion. You can change your match or explore every habitat later in Companion Studio.</p>
          <div className="mt-6 flex gap-1.5" aria-label={`Question ${step + 1} of 4`}>
            {COMPANION_QUIZ_QUESTIONS.map((item, index) => <span key={item.id} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-emerald-300' : 'bg-white/10'}`} />)}
          </div>
        </div>

        {!showResult ? <div className="px-6 py-7 sm:px-9 sm:py-9">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">Question {step + 1} of {COMPANION_QUIZ_QUESTIONS.length}</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{question.title}</h2>
          <p className="mt-2 text-sm text-white/55">{question.prompt}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.id;
              return <button key={option.id} type="button" aria-pressed={selected}
                onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-emerald-300/60 bg-emerald-300/10' : 'border-white/10 bg-white/[.025] hover:border-white/20 hover:bg-white/[.05]'}`}>
                <span className="flex items-center justify-between gap-3 text-sm font-semibold">{option.label}{selected ? <Check className="size-4 text-emerald-300" /> : null}</span>
                <span className="mt-1.5 block text-xs leading-5 text-white/50">{option.description}</span>
              </button>;
            })}
          </div>
          <div className="mt-8 flex items-center justify-between gap-3">
            <button type="button" onClick={() => step === 0 ? void navigate({ to: '/' }) : setStep((current) => current - 1)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs text-white/60 hover:bg-white/5">
              <ArrowLeft className="size-3.5" /> {step === 0 ? 'Skip for now' : 'Back'}
            </button>
            <button type="button" onClick={continueQuiz} disabled={!canContinue}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-xs font-semibold text-[#0b170f] hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-35">
              {step === COMPANION_QUIZ_QUESTIONS.length - 1 ? 'See my match' : 'Continue'} <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div> : <div className="px-6 py-8 sm:px-9 sm:py-10">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-300"><Sparkles className="size-3.5" /> Your starting companion</p>
          <div className="mt-5 grid items-center gap-6 sm:grid-cols-[190px_minmax(0,1fr)]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[24px] border border-emerald-300/15 bg-[#07140d] p-4">
              {recommendation.portraitUrl || recommendation.avatarUrl
                ? <img src={recommendation.portraitUrl || recommendation.avatarUrl || ''} alt={`${recommendation.name}, ${recommendation.animal}`} className="h-full w-full object-contain" />
                : <PawPrint className="size-16 text-emerald-300/60" />}
            </div>
            <div>
              <h2 className="text-3xl font-semibold">{recommendation.name}</h2>
              <p className="mt-1 text-sm text-emerald-200/75">{recommendation.animal} · {recommendation.role}</p>
              <p className="mt-4 text-sm leading-6 text-white/65">{recommendation.description}</p>
              <p className="mt-4 text-xs leading-5 text-white/45">This is a starting match, not a permanent assignment. Your full companion library and habitat packs remain available in Settings → Customize → Companions.</p>
            </div>
          </div>
          {(saveError || error) ? <p role="alert" className="mt-6 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-xs text-rose-100">{saveError || error}</p> : null}
          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6">
            <button type="button" onClick={() => setShowResult(false)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs text-white/60 hover:bg-white/5"><ArrowLeft className="size-3.5" /> Review answers</button>
            <button type="button" onClick={() => void chooseMatch()} disabled={loading || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-300 px-5 text-xs font-semibold text-[#0b170f] hover:bg-emerald-200 disabled:opacity-50">{loading ? 'Loading account settings…' : saving ? 'Saving your match…' : `Choose ${recommendation.name}`} <Check className="size-3.5" /></button>
          </div>
        </div>}
      </section>
      <p className="mt-5 text-center text-[10px] text-white/30">You can revisit this match anytime. Your companion choice is saved to your account.</p>
    </div>
  </main>;
}
