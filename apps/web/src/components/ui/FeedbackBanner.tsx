import type { FeedbackState } from '../../types';

interface FeedbackBannerProps {
  feedback: FeedbackState;
}

function FeedbackBanner({ feedback }: FeedbackBannerProps) {
  if (!feedback.text) return null;
  return (
    <div className={`feedback-toast ${feedback.type}`}>
      <div className="feedback-toast-title">
        {feedback.type === 'success' ? 'Готово' : 'Нужно внимание'}
      </div>
      <div>{feedback.text}</div>
    </div>
  );
}

export default FeedbackBanner;
