import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DescriptionInputProps {
  value: string;
  isDark: boolean;
  onChange: (value: string) => void;
}

export const DescriptionInput = React.memo(({ value, isDark, onChange }: DescriptionInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += part;
        } else {
          interimTranscript += part;
        }
      }

      if (finalTranscript || interimTranscript) {
        onChange(
          ((finalTranscript ? value + ' ' + finalTranscript : value) + (interimTranscript ? ' ' + interimTranscript : ''))
            .trim()
            .replace(/\s\s+/g, ' ')
        );
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  }, [isListening]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contextual Data</label>
        <button
          onClick={toggleListening}
          className={`text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 transition-colors shadow-md ${
            isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>{' '}
          {isListening ? 'STOP' : 'DICTATE'}
        </button>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={handleTextChange}
          placeholder="Tell us about the product features, brand, or specific selling points..."
          className={`w-full h-64 p-6 rounded-[2.5rem] border-2 text-sm focus:border-red-500 outline-none transition-colors resize-none shadow-inner leading-relaxed ${
            isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50/50 border-slate-100'
          }`}
        />
        {isListening && (
          <div className="absolute bottom-6 right-6 flex gap-1 items-center">
            <div className="w-1 h-3 bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-5 bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-3 bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
});
DescriptionInput.displayName = 'DescriptionInput';
