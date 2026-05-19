import { MessageSquare } from 'lucide-react';

interface CommentsSectionProps {
  commentList: string[];
  hasComments: boolean;
}

const CommentsSection = ({ commentList, hasComments }: CommentsSectionProps) => {
  if (!hasComments) return null;
  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
        <MessageSquare className="w-4 h-4 text-blue-500" />
        Persönliche Kommentare
        <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{commentList.length}</span>
      </h4>
      {commentList.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Noch keine Kommentare.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {commentList.map((c, i) => (
            <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-gray-800 leading-relaxed">{c}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
