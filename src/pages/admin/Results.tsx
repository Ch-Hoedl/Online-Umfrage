import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option, Response } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, QrCode, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

const Results = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [key: string]: Option[] }>({});
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  const surveyUrl = `${window.location.origin}/survey/${id}`;

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', id)
        .single();

      if (surveyError) throw surveyError;
      setSurvey(surveyData);

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', id)
        .order('order_index');

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      const { data: optionsData, error: optionsError } = await supabase
        .from('options')
        .select('*')
        .in('question_id', questionsData?.map((q) => q.id) || []);

      if (optionsError) throw optionsError;

      const optionsByQuestion: { [key: string]: Option[] } = {};
      optionsData?.forEach((option) => {
        if (!optionsByQuestion[option.question_id]) {
          optionsByQuestion[option.question_id] = [];
        }
        optionsByQuestion[option.question_id].push(option);
      });
      setOptions(optionsByQuestion);

      const { data: responsesData, error: responsesError } = await supabase
        .from('responses')
        .select('*')
        .in('question_id', questionsData?.map((q) => q.id) || []);

      if (responsesError) throw responsesError;
      setResponses(responsesData || []);
    } catch (error) {
      toast.error('Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  const getChartData = (questionId: string) => {
    const questionOptions = options[questionId] || [];
    const questionResponses = responses.filter((r) => r.question_id === questionId);

    return questionOptions.map((option) => ({
      name: option.option_text,
      value: questionResponses.filter((r) => r.option_id === option.id).length,
    }));
  };

  const getTextResponses = (questionId: string) => {
    return responses
      .filter((r) => r.question_id === questionId && r.text_response)
      .map((r) => r.text_response);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(surveyUrl);
    toast.success('Link kopiert!');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
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

  const totalResponses = new Set(responses.map((r) => r.participant_id)).size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{survey.title}</h1>
            <p className="text-gray-600">
              {totalResponses} {totalResponses === 1 ? 'Teilnehmer' : 'Teilnehmer'}
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <QrCode className="w-5 h-5 mr-2" />
                QR-Code anzeigen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Umfrage teilen</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="bg-white p-4 rounded-lg border-2">
                  <QRCodeSVG value={surveyUrl} size={256} />
                </div>
                <div className="w-full">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={surveyUrl}
                      readOnly
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                    />
                    <Button onClick={copyToClipboard} size="icon">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-6">
          {questions.map((question) => {
            const chartData = getChartData(question.id);
            const textResponses = getTextResponses(question.id);
            
            return (
              <Card key={question.id}>
                <CardHeader>
                  <CardTitle>{question.question_text}</CardTitle>
                </CardHeader>
                <CardContent>
                  {question.question_type === 'open' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 mb-4">
                        {textResponses.length} {textResponses.length === 1 ? 'Antwort' : 'Antworten'}
                      </p>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {textResponses.map((response, index) => (
                          <div key={index} className="p-3 bg-gray-50 rounded-lg border">
                            <p className="text-gray-900">{response}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
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
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#3b82f6" name="Antworten" />
                          </BarChart>
                        </ResponsiveContainer>
                      </TabsContent>
                      
                      <TabsContent value="line" className="mt-6">
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" name="Antworten" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </TabsContent>
                      
                      <TabsContent value="pie" className="mt-6">
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </TabsContent>
                    </Tabs>
                  )}
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