import { useState, useCallback } from 'react';
import {
  loadDWPoseSession, runDWPose, buildArmatureNodes, analyzeGroups,
  matchTag, estimateSkeletonFromBounds, DWPOSE_URL, clearDWPoseSession,
} from '../../io/armatureOrganizer';

export default function PsdImportWizard({
  step,
  onSetStep,
  pendingPsd,
  onnxSessionRef,
  onFinalize,
  onSkip,
  onComplete,
  onBack,
}) {
  const [rigStatus, setRigStatus] = useState('');
  const [rigLoading, setRigLoading] = useState(false);

  const { psdW, psdH, layers, partIds } = pendingPsd || {};
  const matchCount = layers ? layers.filter(l => matchTag(l.name) !== null).length : 0;

  /* ── Handle manual rigging (bounding-box heuristic) ────────────────────── */
  const handleRigManually = useCallback(async () => {
    setRigLoading(true);
    try {
      const layerMap = {};
      layers.forEach(l => {
        const key = l.name.toLowerCase().trim();
        layerMap[key] = l;
      });
      const groups = analyzeGroups(layerMap);

      const skeleton = estimateSkeletonFromBounds(layers, psdW, psdH);
      const { groupDefs, assignments } = buildArmatureNodes(skeleton, groups, layers, partIds, () => {
        // uid function — use simple counter based on existing IDs
        return `grp-${Math.random().toString(36).substr(2, 9)}`;
      });

      onFinalize(groupDefs, assignments);
    } catch (err) {
      console.error('[Manual Rig]', err);
      setRigStatus(`Error: ${err.message}`);
    } finally {
      setRigLoading(false);
    }
  }, [layers, psdW, psdH, partIds, onFinalize]);

  /* ── Handle DWPose rigging ────────────────────────────────────────────── */
  const runArmatureRig = useCallback(async (onnxPayload) => {
    setRigLoading(true);
    try {
      setRigStatus('Loading ONNX model…');
      const session = await loadDWPoseSession(onnxPayload);
      onnxSessionRef.current = session;

      const layerMap = {};
      layers.forEach(l => {
        const key = l.name.toLowerCase().trim();
        layerMap[key] = l;
      });
      const groups = analyzeGroups(layerMap);

      const skeleton = await runDWPose(layers, psdW, psdH, session, setRigStatus);

      setRigStatus('Building rig…');
      const { groupDefs, assignments } = buildArmatureNodes(skeleton, groups, layers, partIds, () => {
        return `grp-${Math.random().toString(36).substr(2, 9)}`;
      });

      onFinalize(groupDefs, assignments);
    } catch (err) {
      console.error('[AutoRig]', err);
      setRigStatus(`Error: ${err.message}`);
      clearDWPoseSession();
    } finally {
      setRigLoading(false);
    }
  }, [layers, psdW, psdH, partIds, onFinalize, onnxSessionRef]);

  /* ── Step: Choose rigging method ────────────────────────────────────── */
  if (step === 'choose') {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-popover border border-border rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Set up character rig</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {matchCount} of {layers.length} layers match see-through part names.
              Choose how you'd like to rig this character.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              disabled={rigLoading}
              onClick={handleRigManually}
              className="w-full p-3 text-sm rounded border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <div className="font-medium">Rig manually</div>
              <div className="text-xs text-muted-foreground">Fast heuristic from layer positions</div>
            </button>

            <button
              disabled={rigLoading}
              onClick={() => onSetStep('dwpose')}
              className="w-full p-3 text-sm rounded border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <div className="font-medium">Rig with DWPose</div>
              <div className="text-xs text-muted-foreground">High-accuracy AI pose detection</div>
            </button>

            <button
              disabled={rigLoading}
              onClick={onSkip}
              className="w-full p-3 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <div className="font-medium">Skip rigging</div>
              <div className="text-xs text-muted-foreground">Import flat, no skeleton</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Step: DWPose loading ─────────────────────────────────────────── */
  if (step === 'dwpose') {
    const modelLoaded = !!onnxSessionRef?.current;
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-popover border border-border rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Load DWPose model</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Download or upload the ~50 MB DWPose ONNX model for high-accuracy pose detection.
            </p>
          </div>

          {/* Model status */}
          <div className="p-2 rounded bg-muted border border-border">
            <p className="text-xs text-muted-foreground">
              Status: {modelLoaded ? (
                <span className="text-green-500 font-medium">Loaded ✓</span>
              ) : (
                <span className="text-amber-500">Not loaded</span>
              )}
            </p>
          </div>

          {/* Load buttons */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Load Model</div>
            <div className="flex gap-2">
              {/* Local .onnx file */}
              <label className={[
                'flex-1 text-center px-3 py-1.5 text-xs rounded border cursor-pointer transition-colors',
                rigLoading
                  ? 'opacity-40 pointer-events-none border-border text-muted-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              ].join(' ')}>
                Load .onnx file
                <input
                  type="file" accept=".onnx" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    runArmatureRig(await f.arrayBuffer());
                  }}
                  disabled={rigLoading}
                />
              </label>

              {/* Download from HuggingFace */}
              <button
                disabled={rigLoading}
                className="flex-1 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-40"
                onClick={() => runArmatureRig(DWPOSE_URL)}
              >
                {rigLoading ? 'Working…' : 'Download'}
              </button>
            </div>

            {/* Status */}
            {rigStatus && (
              <p className={[
                'text-[11px] px-1',
                rigStatus.startsWith('Error') ? 'text-red-400' : 'text-muted-foreground',
              ].join(' ')}>
                {rigStatus}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between border-t border-border pt-3">
            <button
              disabled={rigLoading}
              className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              onClick={() => onSetStep('choose')}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Step: Adjust joints (floating toolbar) ────────────────────────── */
  if (step === 'adjust') {
    return (
      <div className="absolute top-0 inset-x-0 z-40 flex items-center gap-4 px-4 py-2
                      bg-background/90 border-b border-border backdrop-blur-sm">
        <span className="text-xs font-semibold text-foreground">Adjust Joints</span>
        <span className="text-xs text-muted-foreground flex-1">
          Drag yellow dots to reposition joints.
        </span>
        <button
          onClick={onBack}
          className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onComplete}
          className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
        >
          Finish
        </button>
      </div>
    );
  }

  return null;
}
