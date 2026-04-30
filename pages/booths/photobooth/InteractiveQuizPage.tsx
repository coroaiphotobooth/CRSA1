import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Settings, CheckCircle, XCircle } from 'lucide-react';

interface InteractiveQuizPageProps {
  pageConfig: any;
  onNext: (data?: any) => void;
  onBack: () => void;
  onAdmin?: () => void;
}

const InteractiveQuizPage: React.FC<InteractiveQuizPageProps> = ({ 
  pageConfig, 
  onNext, 
  onBack,
  onAdmin 
}) => {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<{ [questionId: string]: string }>({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  const questions = pageConfig?.questions || [];
  
  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionId
    }));
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q: any) => {
      const selectedOptionId = answers[q.id];
      const selectedOption = q.options.find((o: any) => o.id === selectedOptionId);
      if (selectedOption?.isCorrect) {
        correct++;
      }
    });
    return Math.round((correct / questions.length) * 100);
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    } else {
      const finalScore = calculateScore();
      setScore(finalScore);
      setShowResults(true);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setCurrentQuestionIdx(0);
    setShowResults(false);
  };

  const currentQuestion = questions[currentQuestionIdx];
  const hasAnsweredCurrent = !!answers[currentQuestion?.id];
  const passScore = pageConfig?.passScore ?? 100;
  const isPassed = score >= passScore;

  if (!questions || questions.length === 0) {
    return (
      <div className="w-full h-full min-h-screen flex flex-col items-center justify-center p-6 text-white text-center">
        {onAdmin && (
          <button onClick={onAdmin} className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all shadow-xl backdrop-blur-md border border-white/10 z-50">
            <Settings className="w-5 h-5 text-white/50 hover:text-white" />
          </button>
        )}
        <h2 className="text-2xl font-bold uppercase tracking-widest text-[#bc13fe] mb-4">Quiz Page</h2>
        <p className="text-gray-400">Please configure questions in the admin panel.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen flex flex-col items-center justify-center p-6 lg:p-10 relative">
      {onAdmin && (
        <button 
          onClick={onAdmin}
          className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all shadow-xl backdrop-blur-md border border-white/10 z-50"
        >
          <Settings className="w-5 h-5 text-white/50 hover:text-white" />
        </button>
      )}

      {showResults ? (
        <div className="w-full max-w-xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(188,19,254,0.15)] rounded-[2rem] p-8 md:p-12 animate-in fade-in zoom-in-95 duration-500 text-center">
           <h2 className={`text-4xl md:text-5xl font-heading tracking-widest uppercase font-bold mb-6 ${isPassed ? 'text-green-400' : 'text-red-400'} drop-shadow-lg`}>
             {isPassed ? 'YOU PASSED!' : 'TRY AGAIN'}
           </h2>
           
           <div className="w-48 h-48 mx-auto rounded-full bg-black/50 border-4 flex items-center justify-center flex-col mb-8 relative shadow-inner" style={{ borderColor: isPassed ? '#4ade80' : '#f87171' }}>
             {isPassed ? <CheckCircle className="absolute top-2 right-2 w-8 h-8 text-green-400" /> : <XCircle className="absolute top-2 right-2 w-8 h-8 text-red-400" />}
             <span className="text-6xl font-bold text-white tracking-tighter">{score}</span>
             <span className="text-sm font-bold uppercase tracking-widest text-gray-400 mt-1">Score</span>
           </div>

           <p className="text-gray-300 text-sm md:text-base font-medium max-w-sm mx-auto mb-10">
             {isPassed ? 'Congratulations! You have successfully completed the quiz.' : `You need ${passScore}% to pass. Don't worry, you can try again!`}
           </p>

           <div className="flex gap-4">
             {!isPassed && pageConfig?.onFail === 'retry' ? (
               <button onClick={handleRetry} className="flex-1 py-4 bg-gradient-to-r from-red-600/90 to-orange-500/90 hover:from-red-500 hover:to-orange-400 text-white rounded-2xl text-sm font-bold uppercase tracking-widest transition-all shadow-lg border border-white/20 backdrop-blur-sm">
                 Retry Quiz
               </button>
             ) : (
               <button onClick={() => onNext({ quizScore: score })} className="flex-1 py-4 bg-gradient-to-r from-blue-600/90 to-[#bc13fe]/90 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-2xl text-sm font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(188,19,254,0.4)] border border-white/20 backdrop-blur-sm flex items-center justify-center gap-2">
                 CONTINUE <ArrowRight className="w-5 h-5" />
               </button>
             )}
           </div>
        </div>
      ) : (
        <div className="w-full max-w-xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(188,19,254,0.15)] rounded-[2rem] p-8 md:p-12 animate-in fade-in slide-in-from-bottom-5 duration-500">
          <div className="text-center mb-10">
            <h1 className="text-2xl md:text-3xl font-heading tracking-widest text-yellow-400 uppercase font-bold text-shadow-glow drop-shadow-2xl">
              {pageConfig?.title || 'Quiz'}
            </h1>
            {pageConfig?.description && (
              <p className="text-sm mt-3 text-gray-200 drop-shadow-lg font-medium">
                {pageConfig.description}
              </p>
            )}
            
            <div className="w-full bg-black/50 h-2 rounded-full mt-6 overflow-hidden border border-white/10">
               <div className="h-full bg-yellow-400 transition-all duration-300" style={{ width: `${((currentQuestionIdx + 1) / questions.length) * 100}%` }}></div>
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-2">
               Question {currentQuestionIdx + 1} of {questions.length}
            </div>
          </div>

          <div className="mb-10 text-center">
            <h3 className="text-xl md:text-2xl text-white font-medium drop-shadow-md">
              {currentQuestion.questionText}
            </h3>
          </div>

          <div className="space-y-3">
            {currentQuestion.options.map((opt: any) => {
              const isSelected = answers[currentQuestion.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                  className={`w-full p-5 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${
                    isSelected 
                      ? 'border-yellow-400 bg-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.3)]' 
                      : 'border-white/10 bg-black/50 hover:bg-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center gap-4 relative z-10">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-yellow-400 bg-yellow-400' : 'border-gray-500'}`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-black" />}
                    </div>
                    <span className={`text-base font-medium ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                      {opt.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 pt-8">
            <button
              type="button"
              onClick={currentQuestionIdx === 0 ? onBack : () => setCurrentQuestionIdx(currentQuestionIdx - 1)}
              className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold uppercase tracking-widest transition-all flex items-center justify-center backdrop-blur-sm shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              disabled={!hasAnsweredCurrent}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border backdrop-blur-sm ${
                hasAnsweredCurrent 
                  ? 'bg-gradient-to-r from-yellow-500/90 to-orange-500/90 hover:from-yellow-400 hover:to-orange-400 text-white border-white/20 shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:shadow-[0_0_30px_rgba(250,204,21,0.6)]' 
                  : 'bg-black/50 text-gray-500 border-white/5 cursor-not-allowed'
              }`}
            >
              {currentQuestionIdx === questions.length - 1 ? 'FINISH' : 'NEXT'} <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveQuizPage;
