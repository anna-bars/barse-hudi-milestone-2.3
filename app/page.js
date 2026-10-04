'use client';

import { useEffect, useRef, useState } from 'react';
import { useRive, useStateMachineInput, Layout, Fit, Alignment } from '@rive-app/react-canvas';

const STATE_MACHINE = 'Hudi Controller';

// File lives in /public, so it is served from the site root.
// If you ever replace the file under the same name, bump ?v=2, ?v=3 ... to bypass browser cache.
const RIVE_SRC = '/hudi_rig_v2_final_vol01.riv';

// Length of the Celebrate animation in ms. Blink is suppressed for this long after Celebrate fires.
// Set it to your real animation length (+ a small margin).
const CELEBRATE_MS = 5500;

const VISEMES = [
  { v: 0, name: 'sil' }, { v: 1, name: 'pbm' }, { v: 2, name: 'fv' }, { v: 3, name: 'th' },
  { v: 4, name: 'td' }, { v: 5, name: 'kg' }, { v: 6, name: 'chsh' }, { v: 7, name: 'sz' },
  { v: 8, name: 'n' }, { v: 9, name: 'r' }, { v: 10, name: 'ah' }, { v: 11, name: 'eh' },
  { v: 12, name: 'ih' }, { v: 13, name: 'oh' }, { v: 14, name: 'oo' }, { v: 15, name: 'spare' },
];

const EMOTIONS = [
  { key: 'playJoy', label: 'Joy' },
  { key: 'playSadness', label: 'Sadness' },
  { key: 'playSurprise', label: 'Surprise' },
  { key: 'playThinking', label: 'Thinking' },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function Page() {
  const [eyeX, setEyeX] = useState(0);
  const [eyeY, setEyeY] = useState(0);
  const [blinkFeed, setBlinkFeed] = useState({ count: 0, lastAt: null });
  const [isSpeakingDemo, setIsSpeakingDemo] = useState(false);
  const [visemeName, setVisemeName] = useState('sil');
  const [lastEmotion, setLastEmotion] = useState(null);

  const { rive, RiveComponent } = useRive({
    src: RIVE_SRC,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  const eyeXInput = useStateMachineInput(rive, STATE_MACHINE, 'eye_x');
  const eyeYInput = useStateMachineInput(rive, STATE_MACHINE, 'eye_y');
  const blink = useStateMachineInput(rive, STATE_MACHINE, 'blink');
  const isSpeaking = useStateMachineInput(rive, STATE_MACHINE, 'is_speaking');
  const mouthShape = useStateMachineInput(rive, STATE_MACHINE, 'mouth_shape');

  const greet = useStateMachineInput(rive, STATE_MACHINE, 'greet');
  const celebrate = useStateMachineInput(rive, STATE_MACHINE, 'celebrate');
  const point = useStateMachineInput(rive, STATE_MACHINE, 'point');
  const wave = useStateMachineInput(rive, STATE_MACHINE, 'wave');

  const playJoy = useStateMachineInput(rive, STATE_MACHINE, 'playJoy');
  const playSadness = useStateMachineInput(rive, STATE_MACHINE, 'playSadness');
  const playSurprise = useStateMachineInput(rive, STATE_MACHINE, 'playSurprise');
  const playThinking = useStateMachineInput(rive, STATE_MACHINE, 'playThinking');
  const emotionInputs = { playJoy, playSadness, playSurprise, playThinking };

  // While Celebrate plays (eyes are happy closed arcs) no blink may fire.
  const blinkBlockedUntil = useRef(0);
  const isCelebrating = () => Date.now() < blinkBlockedUntil.current;

  // Auto blink — random 3–6s cadence, skipped during Celebrate
  const blinkTimeout = useRef(null);
  useEffect(() => {
    if (!blink) return undefined;
    const schedule = () => {
      const delay = 3000 + Math.random() * 3000;
      blinkTimeout.current = setTimeout(() => {
        if (!isCelebrating()) {
          blink.fire();
          setBlinkFeed((f) => ({ count: f.count + 1, lastAt: Date.now() }));
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(blinkTimeout.current);
  }, [blink]);

  const onEyeChange = (x, y) => {
    setEyeX(x);
    setEyeY(y);
    if (eyeXInput) eyeXInput.value = x;
    if (eyeYInput) eyeYInput.value = y;
  };

  const fireEmotion = (key, label) => {
    const input = emotionInputs[key];
    if (!input) return;
    input.fire();
    setLastEmotion(label);
  };

  const fireGesture = (input) => input?.fire();

  const fireCelebrate = () => {
    if (!celebrate) return;
    blinkBlockedUntil.current = Date.now() + CELEBRATE_MS;
    celebrate.fire();
  };

  const fireBlink = () => {
    if (!blink || isCelebrating()) return;
    blink.fire();
  };

  // ---- Audio-driven lipsync ----
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const setViseme = (v) => {
    if (mouthShape) mouthShape.value = v;
    setVisemeName(VISEMES.find((x) => x.v === v)?.name ?? 'sil');
  };

  const stopSpeaking = () => {
    cancelAnimationFrame(rafRef.current);
    if (isSpeaking) isSpeaking.value = false;
    setViseme(0);
    setIsSpeakingDemo(false);
  };

  const speakTheText = () => {
    const audio = audioRef.current;
    if (!audio || !isSpeaking || !mouthShape) return;

    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }
    audioCtxRef.current.resume();

    isSpeaking.value = true;
    setIsSpeakingDemo(true);
    audio.currentTime = 0;
    audio.play();

    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      analyserRef.current.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      if (avg < 8) {
        setViseme(0);
      } else {
        const idx = 1 + Math.round((avg / 255) * 14);
        setViseme(Math.min(15, Math.max(1, idx)));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.addEventListener('ended', stopSpeaking);
    return () => audio.removeEventListener('ended', stopSpeaking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, mouthShape]);

  const anyEmotionWired = Object.values(emotionInputs).some(Boolean);

  return (
    <>
      <audio ref={audioRef} src="/audio/hope-great-day.mp3" preload="auto" />

      {/* ================= HERO — LIVE DEMO ================= */}
      <div className="layout">
        <div className="stage">
          <div className="stage-grid" />
          <div className="stage-tag"><span className="dot" />Live on canvas</div>
          <div className="canvas-wrap">
            <RiveComponent />
          </div>
          <div className="stage-hex">#4719EA</div>
        </div>

        <div className="panel">
          <div className="top-tag">
            <span className="pulse" />
            Live State Machine
            <span className="update-pill">Milestone 2 · Part 1</span>
          </div>
          <h1>Hudi Controller</h1>
          <p className="sub">
            Eye tracking and four emotion reactions, layered onto the
            Milestone 1 rig — lipsync and blink carry over unchanged.
          </p>

          <div className="group-label">
            Emotions
            {!anyEmotionWired && <span className="locked-tag">waiting on updated .riv</span>}
          </div>
          <div className="chip-row">
            {EMOTIONS.map(({ key, label }) => (
              <button
                key={key}
                className="chip-btn"
                disabled={!emotionInputs[key]}
                title={!emotionInputs[key] ? `${key} not found in the loaded .riv` : undefined}
                onClick={() => fireEmotion(key, label)}
              >
                <span className="chip-dot" />{label}
              </button>
            ))}
          </div>

          <div className="group-label">Eye Tracking (eye_x / eye_y)</div>
          <div className="card" style={{ padding: 16, display: 'flex', justifyContent: 'center', marginBottom: 30 }}>
            <EyePad x={eyeX} y={eyeY} onChange={onEyeChange} />
          </div>

          <div className="group-label">Gestures</div>
          <div className="chip-row">
            <button className="chip-btn" onClick={() => fireGesture(greet)} disabled={!greet}><span className="chip-dot" />Greet</button>
            <button className="chip-btn" onClick={fireCelebrate} disabled={!celebrate}><span className="chip-dot" />Celebrate</button>
            <button className="chip-btn" onClick={() => fireGesture(point)} disabled={!point}><span className="chip-dot" />Point</button>
            <button className="chip-btn" onClick={() => fireGesture(wave)} disabled={!wave}><span className="chip-dot" />Wave</button>
          </div>

          <div className="group-label">Blink &amp; Lipsync</div>
          <div style={{ marginBottom: 12 }}>
            <button className="btn blink" onClick={fireBlink}>
              <span className="dot" />
              Blink
            </button>
            <button className="btn speak" onClick={speakTheText} disabled={isSpeakingDemo}>
              <span className="dot" />
              {isSpeakingDemo ? 'Speaking…' : 'Speak the text'}
            </button>
          </div>

          <div className="state-readout">
            <span className="live-dot" />
            is_speaking: <b>{isSpeakingDemo ? 'true' : 'false'}</b> · mouth_shape: <b>{visemeName}</b>
            {lastEmotion && <>&nbsp;· last emotion: <b>{lastEmotion}</b></>}
          </div>

          {!anyEmotionWired && (
            <p className="build-note">
              This preview is loading the Milestone 1 rig file as a placeholder,
              so the four emotion triggers above are visibly disabled — eye
              tracking, blink, gestures, and lipsync are all live. Drop the
              updated Milestone 2 Part 1 <code>hudi.riv</code> into{' '}
              <code>/public</code> to light up Joy / Sadness / Surprise / Thinking.
            </p>
          )}

          <a className="scroll-cue" href="#overview">
            <span>Integration docs</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>

      {/* ================= DOCUMENTATION ================= */}
      <div className="docs">
        <div className="docs-shell">
          <DocsNav />

          <div className="docs-body">
            <DocSection id="overview" eyebrow="Milestone 2 · Part 1" title="Eye tracking & emotion animations">
              <p>
                This delivery adds two systems on top of the existing Hudi
                rig from Milestone 1 (rigging, bone hierarchy, 16-viseme
                lipsync): real-time eye tracking, and four emotion reaction
                animations — Joy, Sadness, Surprise, and Thinking.
              </p>
              <p>
                Both systems run independently from the rig&rsquo;s core
                (Idle, Blink, Lipsync), so they play simultaneously without
                interfering with each other.
              </p>
              <div className="update-grid">
                <div className="update-card system-a">
                  <div className="update-card-title">Eye Tracking</div>
                  <ul>
                    <li>Rive Listener → Align Target on each pupil</li>
                    <li>Distance Constraint keeps pupils inside the sclera</li>
                    <li><code>eye_x</code> / <code>eye_y</code> remain drivable from code</li>
                  </ul>
                </div>
                <div className="update-card">
                  <div className="update-card-title">Emotions</div>
                  <ul>
                    <li>4 single-shot reactions: Joy, Sadness, Surprise, Thinking</li>
                    <li>Trigger-based, not blended — plays once, returns to Idle</li>
                    <li>Star silhouette never deforms in any pose</li>
                  </ul>
                </div>
              </div>
            </DocSection>

            <DocSection id="eye-tracking" eyebrow="System 1" title="Eye tracking">
              <p>
                A Rive <code>Listener</code> drives an <code>Align Target</code>{' '}
                applied directly to <code>L-Eye_Pupil</code> and{' '}
                <code>R-Eye_Pupil</code> — not the whole head — each restricted
                by a Distance Constraint so the pupils track a target but can
                never leave the sclera.
              </p>
              <p>
                A dedicated <code>HitBox</code> plus{' '}
                <code>Header_CONTROLL</code> / <code>Face_CONTROLL</code>{' '}
                target group defines the listening area. Pupil position was
                verified frame-by-frame against pointer position on both
                axes, with no clipping at tested extremes.
              </p>
              <h3>Production note</h3>
              <p>
                For touch devices or anywhere there&rsquo;s no live pointer
                (mobile, React Native), the <code>eye_x</code> /{' '}
                <code>eye_y</code> Number inputs stay independently drivable
                from code — the in-editor Listener is for live preview and
                testing, not the only way to drive tracking. That&rsquo;s
                what the pad in the demo above is doing.
              </p>
            </DocSection>

            <DocSection id="emotions" eyebrow="System 2" title="Emotion animations">
              <p>
                Every pose is achieved through rigid rotations — head tilt,
                arm/elbow rotation, body shift — and internal facial-feature
                changes only. No new mesh deformation was needed; each
                animation is fully compatible with the existing bone rig and
                plays once, Neutral → pose → back to Neutral.
              </p>
              <table className="emotion-table">
                <thead>
                  <tr><th>Emotion</th><th>Key changes</th></tr>
                </thead>
                <tbody>
                  <tr><td>Joy</td><td>Eyes → cheerful crescents, wide open smile, more intense blush, one subtle body bounce</td></tr>
                  <tr><td>Sadness</td><td>Eyelids droop, frown, slumped posture, ends with a sigh/exhale vapor-puff effect</td></tr>
                  <tr><td>Surprise</td><td>Eyes widen, small round &ldquo;O&rdquo; mouth, quick rigid recoil/hop</td></tr>
                  <tr><td>Thinking</td><td>Mouth → flat pursed line, head tilt, arm bends toward chin (elbow rig reused from Milestone 1)</td></tr>
                </tbody>
              </table>
            </DocSection>

            <DocSection id="state-machine" eyebrow="Architecture" title="Hudi Controller state machine">
              <p>
                Trigger-based discrete states, not a Blend State — these are
                one-shot reactions, not continuously interpolated poses.
                Continuous blending stays reserved for eye tracking and
                lipsync, where intermediate values are meaningful.
              </p>
              <div className="tree-block">{`Entry → Idle (default)
Idle → Emotion_Joy       [Trigger: playJoy]
Idle → Emotion_Sadness   [Trigger: playSadness]
Idle → Emotion_Surprise  [Trigger: playSurprise]
Idle → Emotion_Thinking  [Trigger: playThinking]

Emotion_X → Idle   [Exit Time = 1, automatic — plays once, returns on its own]`}</div>
            </DocSection>

            <DocSection id="inputs" eyebrow="Reference" title="Input reference">
              <div className="inputs-grid">
                <InputCard kind="Trigger" name="playJoy" desc="Plays the Joy reaction once, then returns to Idle." />
                <InputCard kind="Trigger" name="playSadness" desc="Plays the Sadness reaction once, then returns to Idle." />
                <InputCard kind="Trigger" name="playSurprise" desc="Plays the Surprise reaction once, then returns to Idle." />
                <InputCard kind="Trigger" name="playThinking" desc="Plays the Thinking reaction once, then returns to Idle." />
                <InputCard kind="Number" name="eye_x" desc="Horizontal gaze target, driven live by the Listener or by code." />
                <InputCard kind="Number" name="eye_y" desc="Vertical gaze target, driven live by the Listener or by code." />
                <InputCard kind="Trigger" name="blink" desc="Plays one blink cycle, then resets. Unchanged from Milestone 1." />
                <InputCard kind="Bool" name="is_speaking" desc="Switches the mouth from resting to the talking blend." />
                <InputCard kind="Number" name="mouth_shape" desc="Selects a mouth viseme, 0–15. Unchanged from Milestone 1." />
                <InputCard kind="Trigger" name="greet / celebrate / point / wave" desc="Gesture triggers — fully wired with the complete state machine." />
              </div>
            </DocSection>

            <DocSection id="panel-structure" eyebrow="Rive Project" title="Animations panel structure">
              <div className="tree-block">{`Emotion_Animations/
  Emotion_Joy
  Emotion_Sadness
  Emotion_Surprise
  Emotion_Thinking

Base/
  Idle
  Blink

Setup/
  Idle_Smile
  Base

Visemes/
  hudi_lips_00 … hudi_lips_15

Eye_X_Tracking/  Eye_Y_Tracking/
  Left / Right / Center per axis`}</div>
            </DocSection>

            <DocSection id="compatibility" eyebrow="Verified" title="Compatibility testing">
              <ul className="check-list done">
                <li>Blink continues to fire independently during any Emotion state</li>
                <li>Eye tracking (<code>eye_x</code>/<code>eye_y</code>) stays responsive while an Emotion animation is playing</li>
                <li>Lipsync (<code>mouth_shape</code>/<code>is_speaking</code>) stays responsive while an Emotion animation is playing</li>
                <li>Each system lives on its own Animation Layer and blends independently in the state machine</li>
              </ul>
              <h3>Grain texture</h3>
              <p>
                Applied consistently to all new geometry introduced this
                milestone — sad eyes, sigh puff, joy smile, surprise mouth —
                to match the shading style established in the Milestone 1
                delivery.
              </p>
            </DocSection>

            <DocSection id="part-2" eyebrow="Milestone 2 · Part 2" title="Gestures &amp; final delivery">
              <ul className="check-list boxes">
                <li>4 gesture animations — Greet, Celebrate, Point, Wave</li>
                <li>Full state machine integration and testing with gestures included</li>
                <li>Final optimization and polish pass</li>
                <li>Demo video</li>
                <li>Project documentation for hand-off</li>
                <li>Final .riv file delivery</li>
              </ul>
            </DocSection>

            <DocSection id="js" eyebrow="JavaScript" title="Web integration example">
              <CodeBlock code={JS_EXAMPLE} />
            </DocSection>

            <DocSection id="rn" eyebrow="React Native" title="React Native example">
              <CodeBlock code={RN_EXAMPLE} />
            </DocSection>

            <DocSection id="lipsync" eyebrow="Unchanged from Milestone 1" title="Audio-driven lipsync">
              <p>
                Amplitude-driven, not true phoneme detection. A Web Audio{' '}
                <code>AnalyserNode</code> reads the clip&rsquo;s live loudness
                and maps it to a <code>mouth_shape</code> index — enough to
                read as talking in sync, without a backend or an ML model.
              </p>
              <LiveFeed
                label="Auto blink — live on the canvas above"
                count={blinkFeed.count}
                lastAt={blinkFeed.lastAt}
                noun="blink"
              />
              <CodeBlock code={LIPSYNC_EXAMPLE} />
            </DocSection>

            <DocSection id="checklist" eyebrow="Integration Checklist" title="Ship it">
              <ul className="check-list boxes">
                <li>Import the updated <code>.riv</code> file</li>
                <li>Load <code>Hudi Controller</code> (name unchanged)</li>
                <li>Wire up the 4 emotion triggers</li>
                <li>Bind <code>eye_x</code> / <code>eye_y</code></li>
                <li>Confirm blink and lipsync still behave as before</li>
                <li>Wire up the 4 gesture triggers</li>
                <li>Done</li>
              </ul>
            </DocSection>

            <footer className="docs-footer">
              Hudi Controller · Rive integration docs · Milestone 2, Part 1
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

function EyePad({ x, y, onChange }) {
  const padRef = useRef(null);
  const dragging = useRef(false);

  const setFromEvent = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const px = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const py = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    onChange(Number(px.toFixed(2)), Number(py.toFixed(2)));
  };

  const handleDown = (e) => {
    dragging.current = true;
    padRef.current.setPointerCapture(e.pointerId);
    setFromEvent(e);
  };
  const handleMove = (e) => { if (dragging.current) setFromEvent(e); };
  const handleUp = () => { dragging.current = false; };

  return (
    <div>
      <div
        className="eye-pad"
        ref={padRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      >
        <div className="eye-pad-cross-h" />
        <div className="eye-pad-cross-v" />
        <div className="eye-pad-dot" style={{ left: `${((x + 1) / 2) * 100}%`, top: `${((y + 1) / 2) * 100}%` }} />
      </div>
      <div className="eye-pad-readout">x: {x.toFixed(2)} · y: {y.toFixed(2)}</div>
    </div>
  );
}

function DocsNav() {
  const items = [
    ['overview', 'Overview'],
    ['eye-tracking', 'Eye Tracking'],
    ['emotions', 'Emotions'],
    ['state-machine', 'State Machine'],
    ['inputs', 'Inputs'],
    ['panel-structure', 'Panel Structure'],
    ['compatibility', 'Compatibility'],
    ['part-2', 'Part 2'],
    ['js', 'JavaScript'],
    ['rn', 'React Native'],
    ['lipsync', 'Audio Lipsync'],
    ['checklist', 'Checklist'],
  ];
  return (
    <nav className="docs-nav">
      <div className="docs-nav-label">Contents</div>
      {items.map(([id, label]) => (
        <a key={id} href={`#${id}`}>{label}</a>
      ))}
    </nav>
  );
}

function DocSection({ id, eyebrow, title, children }) {
  return (
    <section id={id} className="doc-section">
      <div className="doc-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function InputCard({ kind, name, desc }) {
  return (
    <div className="input-card">
      <div className="input-kind">{kind}</div>
      <code>{name}</code>
      <p>{desc}</p>
    </div>
  );
}

function LiveFeed({ label, count, lastAt, noun }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsAgo = lastAt ? Math.max(0, Math.round((Date.now() - lastAt) / 1000)) : null;

  return (
    <div className="live-feed">
      <span className="live-feed-dot" />
      <span className="live-feed-label">{label}</span>
      <span className="live-feed-value">
        {count === 0 ? `waiting for first ${noun}…` : `${count} fired · last ${secondsAgo}s ago`}
      </span>
    </div>
  );
}

function CodeBlock({ code }) {
  return <pre className="code-block"><code>{code}</code></pre>;
}

const JS_EXAMPLE = `import { Rive, Fit, Alignment, Layout } from '@rive-app/canvas'

const r = new Rive({
  src: 'hudi.riv',
  canvas: document.getElementById('hudi-canvas'),
  autoplay: true,
  stateMachines: 'Hudi Controller',
  layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  onLoad: () => {
    const inputs = r.stateMachineInputs('Hudi Controller')
    const playJoy = inputs.find(i => i.name === 'playJoy')
    const eyeX = inputs.find(i => i.name === 'eye_x')
    const eyeY = inputs.find(i => i.name === 'eye_y')

    eyeX.value = 0.4
    eyeY.value = -0.1
    playJoy.fire()
  },
})`;

const RN_EXAMPLE = `import Rive from 'rive-react-native'

export function Hudi() {
  const riveRef = useRef(null)
  const SM = 'Hudi Controller'

  const playEmotion = (name) =>
    riveRef.current?.fireState(SM, name) // playJoy | playSadness | playSurprise | playThinking

  const setGaze = (x, y) => {
    riveRef.current?.setInputState(SM, 'eye_x', x)
    riveRef.current?.setInputState(SM, 'eye_y', y)
  }

  return (
    <Rive
      ref={riveRef}
      resourceName="hudi"
      stateMachineName={SM}
      autoplay
      style={{ width: '100%', height: 320 }}
    />
  )
}`;

const LIPSYNC_EXAMPLE = `// Amplitude-driven lipsync — maps live loudness to a viseme.
// Not phoneme-accurate, but needs no backend or ML model.

const ctx = new AudioContext()
const source = ctx.createMediaElementSource(audioEl)
const analyser = ctx.createAnalyser()
analyser.fftSize = 256
source.connect(analyser)
analyser.connect(ctx.destination)

const data = new Uint8Array(analyser.frequencyBinCount)

function tick() {
  analyser.getByteFrequencyData(data)
  const avg = data.reduce((a, b) => a + b, 0) / data.length

  mouthShape.value = avg < 8
    ? 0
    : Math.min(15, Math.max(1, 1 + Math.round((avg / 255) * 14)))

  requestAnimationFrame(tick)
}

isSpeaking.value = true
audioEl.play()
tick()

audioEl.onended = () => {
  isSpeaking.value = false
  mouthShape.value = 0
}`;