import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option, Response } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, QrCode, Share2, Lock, MessageSquare, Tag, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];
const META_PREFIX = '__dyad_meta__:';

function isMetaOption(t: string) { return t.startsWith(META_PREFIX); }
function parseMeta(t: string) {
  if (!isMetaOption(t)) return null;
  try { return JSON.parse(t.slice(META_PREFIX.length)); } catch { return null; }
}
function isCommentMetaOption(t: string) { return parseMeta(t)?.kind === 'comment'; }
function isTextMetaOption(t: string) { return parseMeta(t)?.kind === 'text'; }
function isCategoryMetaOption(t: string) { return parseMeta(t)?.kind === 'category'; }

const Results = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [key: string]: Option[] }>({});
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('__all__');

  const surveyUrl = `${window.location.origin}/survey/${id}`;

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys').select('*').eq('id', id).single();
      if (surveyError) throw surveyError;
      setSurvey(surveyData);

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions').select('*').eq('survey_id', id).order('order_index');
      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      const { data: optionsData, error: optionsError } = await supabase
        .from('options').select('*').in('question_id', questionsData?.map((q) => q.id) || []);
      if (optionsError) throw optionsError;

      const optionsByQuestion: { [key: string]: Option[] } = {};
      optionsData?.forEach((option) => {
        if (!optionsByQuestion[option.question_id]) optionsByQuestion[option.question_id] = [];
        optionsByQuestion[option.question_id].push(option);
      });
      setOptions(optionsByQuestion);

      const { data: responsesData, error: responsesError } = await supabase
        .from('responses').select('*').in('question_id', questionsData?.map((q) => q.id) || []);
      if (responsesError) throw responsesError;
      setResponses(responsesData || []);
    } catch { toast.error('Fehler beim Laden der Daten'); }
    finally { setLoading(false); }
  };

  const copyToClipboard = () => { navigator.clipboard.writeText(surveyUrl); toast.success('Link kopiert!'); };

  // ── Category logic ────────────────────────────────────────────────────────

  /** The question marked as category (if any) */
  const categoryQuestion = questions.find((q) =>
    (options[q.id] || []).some((o) => isCategoryMetaOption(o.option_text))
  ) ?? null;

  /** Visible options of the category question */
  const categoryOptions = categoryQuestion
    ? (options[categoryQuestion.id] || []).filter((o) => !isMetaOption(o.option_text))
    : [];

  /**
   * Set of participant_ids that match the selected category.
   * If no category question or "all" selected → null (= no filter).
   */
  const filteredParticipants: Set<string> | null = (() => {
    if (!categoryQuestion || selectedCategory === '__all__') return null;
    // Find participants who answered the category question with the selected option
    const catResponses = responses.filter(
      (r) => r.question_id === categoryQuestion.id && r.option_id === selectedCategory
    );
    return new Set(catResponses.map((r) => r.participant_id));
  })();

  /** Filter responses by participant if a category is active */
  const filterResponses = (rs: Response[]) => {
    if (!filteredParticipants) return rs;
    return rs.filter((r) => filteredParticipants.has(r.participant_id));
  };

  // ── Chart helpers ─────────────────────────────────────────────────────────

  const getChartData = (questionId: string) => {
    const questionOptions = (options[questionId] || []).filter((o) => !isMetaOption(o.option_text));
    const questionResponses = filterResponses(
      responses.filter((r) => r.question_id === questionId && r.option_id)
    );
    return questionOptions.map((option) => ({
      name: option.option_text,
      value: questionResponses.filter((r) => r.option_id === option.id).length,
    }));
  };

  const isTextOnlyQuestion = (questionId: string) =>
    (options[questionId] || []).some((o) => isTextMetaOption(o.option_text));

  const hasComments = (questionId: string) =>
    (options[questionId] || []).some((o) => isCommentMetaOption(o.option_text));

  const getComments = (questionId: string): string[] =>
    filterResponses(responses.filter((r) => r.question_id === questionId && r.text_response && !r.option_id))
      .map((r) => r.text_response as string)
      .filter(Boolean);

  const getWordCloud = (questionId: string) => {
    const questionResponses = filterResponses(
      responses.filter((r) => r.question_id === questionId && r.option_id)
    );
    const questionOptions = (options[questionId] || []).filter((o) => !isMetaOption(o.option_text));
    const idToText = new Map(questionOptions.map((o) => [o.id, o.option_text]));
    const counts = new Map<string, number>();
    for (const r of questionResponses) {
      const text = idToText.get(r.option_id ?? '');
      if (!text) continue;
      counts.set(text, (counts.get(text) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }
  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Umfrage nicht gefunden</h2>
          <Button onClick={() => navigate('/admin')}>Zurück zum Dashboard</Button>
        </div>
      </div>
    );
  }

  const allParticipants = new Set(responses.map((r) => r.participant_id));
  const totalResponses = allParticipants.size;
  const filteredCount = filteredParticipants ? filteredParticipants.size : totalResponses;
  const isPublished = survey.status === 'published';

  // Sub-component: comments section
  const CommentsSection = ({ questionId }: { questionId: string }) => {
    const commentList = getComments(questionId);
    if (!hasComments(questionId)) return null;
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

  // Non-category questions to display
  const displayQuestions = questions.filter((q) =>
    !(options[q.id] || []).some((o) => isCategoryMetaOption(o.option_text))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-gray-900">{survey.title}</h1>
              <Badge className={isPublished ? 'bg-green-100 text-green-700 border-green-300' : 'bg-amber-100 text-amber-700 border-amber-300'}>
                {isPublished ? 'Produktiv' : 'Vorlage'}
              </Badge>
            </div>
            <p className="text-gray-600">
              {filteredParticipants
                ? <><span className="font-semibold text-purple-700">{filteredCount}</span> von {totalResponses} Teilnehmern (gefiltert)</>
                : <>{totalResponses} Teilnehmer</>}
            </p>
          </div>

          {isPublished ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <QrCode className="w-5 h-5 mr-2" />QR-Code / Teilen
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Umfrage teilen</DialogTitle>
                  <DialogDescription>Scannen Sie den QR-Code oder kopieren Sie den Link.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="bg-white p-4 rounded-xl border-2"><QRCodeSVG value={surveyUrl} size={220} /></div>
                  <div className="flex gap-2 w-full">
                    <input type="text" value={surveyUrl} readOnly className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50" />
                    <Button onClick={copyToClipboard} size="icon"><Share2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              Teilen erst nach Produktivschaltung möglich
            </div>
          )}
        </div>

        {/* Category filter */}
        {categoryQuestion && (
          <Card className="mb-6 border-purple-200 bg-purple-50/40">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
                  <Tag className="w-4 h-4" />
                  Kategorie-Filter:
                  <span className="font-normal text-purple-700">{categoryQuestion.question_text}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Filter className="w-4 h-4 text-purple-600" />
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-56 border-purple-300 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">
                        Alle Teilnehmer ({totalResponses})
                      </SelectItem>
                      {categoryOptions.map((opt) => {
                        const count = responses.filter(
                          (r) => r.question_id === categoryQuestion.id && r.option_id === opt.id
                        ).length;
                        return (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.option_text} ({count})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedCategory !== '__all__' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory('__all__')}
                      className="border-purple-300 text-purple-700 hover:bg-purple-100"
                    >
                      Filter zurücksetzen
                    </Button>
                  )}
                </div>
              </div>
              {selectedCategory !== '__all__' && (
                <div className="mt-2 text-xs text-purple-700 bg-purple-100 rounded-lg px-3 py-1.5">
                  Zeige Ergebnisse für: <strong>{categoryOptions.find((o) => o.id === selectedCategory)?.option_text}</strong> – {filteredCount} {filteredCount === 1 ? 'Teilnehmer' : 'Teilnehmer'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {totalResponses === 0 && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4 text-sm text-blue-800">
              Noch keine Antworten vorhanden. Teilen Sie die Umfrage, um erste Ergebnisse zu erhalten.
            </CardContent>
          </Card>
        )}

        {/* Charts – category question shown separately at top */}
        {categoryQuestion && (
          <Card className="mb-6 border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-500" />
                {categoryQuestion.question_text}
                <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs ml-1">Kategorie</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const chartData = getChartData(categoryQuestion.id);
                const total = chartData.reduce((s, d) => s + d.value, 0);
                return (
                  <div className="flex flex-wrap gap-3">
                    {chartData.map((item, i) => (
                      <button
                        key={item.name}
                        onClick={() => {
                          const opt = categoryOptions.find((o) => o.option_text === item.name);
                          if (opt) setSelectedCategory(selectedCategory === opt.id ? '__all__' : opt.id);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                          selectedCategory === (categoryOptions.find((o) => o.option_text === item.name)?.id ?? '')
                            ? 'border-purple-500 bg-purple-100 text-purple-800 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        {item.name}
                        <span className="ml-1 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                          {item.value} {total > 0 ? `(${Math.round((item.value / total) * 100)}%)` : ''}
                        </span>
                      </button>
                    ))}
                    {selectedCategory !== '__all__' && (
                      <button
                        onClick={() => setSelectedCategory('__all__')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 text-sm transition-all"
                      >
                        Alle anzeigen
                      </button>
                    )}
                  </div>
                );
              })()}
              <CommentsSection questionId={categoryQuestion.id} />
            </CardContent>
          </Card>
        )}

        {/* Other questions */}
        <div className="space-y-6">
          {displayQuestions.map((question) => {
            if (isTextOnlyQuestion(question.id)) {
              const cloud = getWordCloud(question.id);
              const max = Math.max(1, ...cloud.map((c) => c.count));
              return (
                <Card key={question.id}>
                  <CardHeader><CardTitle>{question.question_text}</CardTitle></CardHeader>
                  <CardContent>
                    {cloud.length === 0 ? (
                      <p className="text-sm text-gray-500">Noch keine Antworten.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {cloud.map((item) => {
                          const size = 12 + Math.round((item.count / max) * 22);
                          return (
                            <span key={item.text} className="px-3 py-1 rounded-full bg-white border text-gray-900" style={{ fontSize: `${size}px` }} title={`${item.count}×`}>
                              {item.text}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <CommentsSection questionId={question.id} />
                  </CardContent>
                </Card>
              );
            }

            const chartData = getChartData(question.id);
            return (
              <Card key={question.id}>
                <CardHeader><CardTitle>{question.question_text}</CardTitle></CardHeader>
                <CardContent>
                  <Tabs defaultValue="bar" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="bar">Balkendiagramm</TabsTrigger>
                      <TabsTrigger value="line">Liniendiagramm</TabsTrigger>
                      <TabsTrigger value="pie">Kreisdiagramm</TabsTrigger>
                    </TabsList>

                    <TabsContent value="bar" className="mt-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip /><Legend />
                          <Bar dataKey="value" fill={filteredParticipants ? '#8b5cf6' : '#3b82f6'} name="Antworten" />
                        </BarChart>
                      </ResponsiveContainer>
                    </TabsContent>

                    <TabsContent value="line" className="mt-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip /><Legend />
                          <Line type="monotone" dataKey="value" stroke={filteredParticipants ? '#8b5cf6' : '#3b82f6'} name="Antworten" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </TabsContent>

                    <TabsContent value="pie" className="mt-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={chartData} cx="50%" cy="50%" labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100} dataKey="value">
                            {chartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </TabsContent>
                  </Tabs>
                  <CommentsSection questionId={question.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Results;
