// Qchess's switch between "Study Mode" and "Move Trainer" (PLAN.md §5.15): on the training screen
// it opens the line on the board in its study, editable; in the chapter view it takes training up
// again (src/app/train.ts: leaveForStudy, trainingFrom).
export function ModeSwitch(props: { current: 'study' | 'train'; onStudy?: () => void; onTrain?: () => void; trainTitle?: string }) {
  return (
    <div class="mode-switch" role="group" aria-label="Study or train">
      <button type="button" aria-pressed={props.current === 'study'} disabled={props.current !== 'study' && !props.onStudy} onClick={props.current === 'study' ? undefined : props.onStudy} title="Open this line in its study, to edit it">
        Study
      </button>
      <button type="button" aria-pressed={props.current === 'train'} onClick={props.current === 'train' ? undefined : props.onTrain} title={props.trainTitle}>
        Train
      </button>
    </div>
  );
}
