import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option, Response } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, QrCode, Share2, Lock, MessageSquare, Tag, Filter, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// jsPDF imported dynamically to avoid build issues if not installed

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
  const [exporting, setExporting] = useState(false);

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

  const isTextOnlyQuestion = (questionId: string) => {
    const q = questions.find((q) => q.id === questionId);
    if (q?.question_type === 'text') return true;
    return (options[questionId] || []).some((o) => isTextMetaOption(o.option_text));
  };

  const isLongTextQuestion = (questionId: string) => {
    const q = questions.find((q) => q.id === questionId);
    return q?.question_type === 'longtext';
  };

  const getLongTextResponses = (questionId: string): string[] =>
    filterResponses(responses.filter((r) => r.question_id === questionId && r.text_response && !r.option_id))
      .map((r) => r.text_response as string)
      .filter(Boolean);

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

  // ── Export ────────────────────────────────────────────────────────────────

  const exportToPDF = async () => {
    if (!survey) return;

    setExporting(true);
    toast.info('PDF wird erstellt...');

    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(survey.title, margin, yPosition);
      yPosition += 10;

      if (survey.description) {
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        const descLines = pdf.splitTextToSize(survey.description, pageWidth - 2 * margin);
        pdf.text(descLines, margin, yPosition);
        yPosition += descLines.length * 5 + 5;
      }

      const totalResponses = new Set(responses.map((r) => r.participant_id)).size;
      pdf.setFontSize(10);
      pdf.text(`Teilnehmer: ${totalResponses}`, margin, yPosition);
      yPosition += 10;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        const questionLines = pdf.splitTextToSize(`${i + 1}. ${question.question_text}`, pageWidth - 2 * margin);
        pdf.text(questionLines, margin, yPosition);
        yPosition += questionLines.length * 6 + 3;

        if (isTextOnlyQuestion(question.id)) {
          const cloud = getWordCloud(question.id);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');

          if (cloud.length === 0) {
            pdf.text('Noch keine Antworten.', margin + 5, yPosition);
            yPosition += 6;
          } else {
            cloud.slice(0, 15).forEach((item) => {
              if (yPosition > pageHeight - 20) {
                pdf.addPage();
                yPosition = margin;
              }
              pdf.text(`• ${item.text} (${item.count}×)`, margin + 5, yPosition);
              yPosition += 5;
            });
          }
        } else if (isLongTextQuestion(question.id)) {
          const longTextResponses = getLongTextResponses(question.id);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');

          if (longTextResponses.length === 0) {
            pdf.text('Noch keine Antworten.', margin + 5, yPosition);
            yPosition += 6;
          } else {
            longTextResponses.forEach((text, idx) => {
              if (yPosition > pageHeight - 30) {
                pdf.addPage();
                yPosition = margin;
              }
              pdf.setFont('helvetica', 'bold');
              pdf.text(`Antwort ${idx + 1}:`, margin + 5, yPosition);
              yPosition += 5;
              pdf.setFont('helvetica', 'normal');
              const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin - 10);
              lines.forEach((line: string) => {
                if (yPosition > pageHeight - 20) {
                  pdf.addPage();
                  yPosition = margin;
                }
                pdf.text(line, margin + 5, yPosition);
                yPosition += 4;
              });
              yPosition += 3;
            });
          }
        } else {
          const chartData = getChartData(question.id);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');

          chartData.forEach((item) => {
            if (yPosition > pageHeight - 20) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(`• ${item.name}: ${item.value}`, margin + 5, yPosition);
            yPosition += 5;
          });
        }

        yPosition += 5;
      }

      pdf.save(`${survey.title.replace(/[^a-z0-9]/gi, '_')}_Ergebnisse.pdf`);
      toast.success('PDF erfolgreich erstellt!');
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Erstellen des PDFs');
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    if (!survey) return;

    try {
      const csvRows: string[] = [];

      // Header
      csvRows.push('Teilnehmer-ID,Frage,Fragetyp,Antwort,Zeitstempel');

      // Daten
      responses.forEach((response) => {
        const question = questions.find((q) => q.id === response.question_id);
        
        // Handle longtext responses
        if (question && response.text_response && !response.option_id && isLongTextQuestion(question.id)) {
          const row = [
            response.participant_id,
            `"${question.question_text.replace(/"/g, '""')}"`,
            question.question_type,
            `"${response.text_response.replace(/"/g, '""')}"`,
            new Date(response.created_at).toLocaleString('de-DE'),
          ];
          csvRows.push(row.join(','));
          return;
        }

        const option = options[response.question_id]?.find((o) => o.id === response.option_id);

        if (question && option && !isMetaOption(option.option_text)) {
          const row = [
            response.participant_id,
            `"${question.question_text.replace(/"/g, '""')}"`,
            question.question_type,
            `"${option.option_text.replace(/"/g, '""')}"`,
            new Date(response.created_at).toLocaleString('de-DE'),
          ];
          csvRows.push(row.join(','));
        }
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${survey.title.replace(/[^a-z0-9]/gi, '_')}_Rohdaten.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('CSV erfolgreich exportiert!');
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Erstellen der CSV');
    }
  };

  const downloadQrCode = () => {
    if (!survey) return;
    const svg = document.querySelector('#qr-code-results-container svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `QR_${survey.title.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('QR-Code heruntergeladen!');
      });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
        <div className="flex items-center gap-4 mb-8 flex-wrap">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
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

          <div className="flex gap-2 flex-wrap">
            <Button onClick={exportToPDF} disabled={exporting} variant="outline">
              <Download className="w-5 h-5 mr-2" />
              {exporting ? 'Erstelle PDF...' : 'PDF exportieren'}
            </Button>
            <Button onClick={exportToCSV} variant="outline">
              <Download className="w-5 h-5 mr-2" />
              CSV exportieren
            </Button>

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
                    <div className="bg-white p-4 rounded-xl border-2" id="qr-code-results-container">
                      <QRCodeSVG value={surveyUrl} size={220} />
                    </div>
                    <div className="flex gap-2 w-full">
                      <input type="text" value={surveyUrl} readOnly className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50" />
                      <Button onClick={copyToClipboard} size="icon"><Share2 className="w-4 h-4" /></Button>
                    </div>
                    <Button variant="outline" className="w-full" onClick={downloadQrCode}>
                      <Download className="w-4 h-4 mr-2" />
                      QR-Code als PNG herunterladen
                    </Button>
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

            if (isLongTextQuestion(question.id)) {
              const longTextResponses = getLongTextResponses(question.id);
              return (
                <Card key={question.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {question.question_text}
                      <Badge className="bg-gray-100 text-gray-700 border-gray-300 text-xs">
                        Freier Text
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {longTextResponses.length === 0 ? (
                      <p className="text-sm text-gray-500">Noch keine Antworten.</p>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {longTextResponses.map((text, i) => (
                          <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {text}
                          </div>
                        ))}
                        <p className="text-xs text-gray-500 mt-2">
                          {longTextResponses.length} {longTextResponses.length === 1 ? 'Antwort' : 'Antworten'}
                        </p>
                      </div>
                    )}
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
