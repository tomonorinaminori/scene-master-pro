import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  deleteDoc
} from 'firebase/firestore';
import { 
  MessageCircle, 
  Send, 
  Volume2, 
  BookOpen, 
  Loader2, 
  Info, 
  RefreshCw,
  Home,
  Star,
  Trash2,
  Sparkles, 
  ArrowRight
} from 'lucide-react';

// --- Configuration ---
// .envが不安定な場合でも動くよう、以前送っていただいた情報を直接埋め込みました
const firebaseConfig = {
  apiKey: "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c",
  authDomain: "scene-master-pro.firebaseapp.com",
  projectId: "scene-master-pro",
  storageBucket: "scene-master-pro.firebasestorage.app",
  messagingSenderId: "116431796651",
  appId: "1:116431796651:web:fbde030210b2f993dbfaee"
};

const geminiApiKey = "AIzaSyDPSMOMuarm6-aSEwRsLTyJmo0jKVnThxw"; 

// Firebaseの初期化（二重初期化を防止）
let app, auth, db;
try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase初期化失敗:", e);
}

const appId = 'scene-master-pro-app';

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [vocabList, setVocabList] = useState([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(null);
  const [error, setError] = useState(null);

  // 1. 匿名認証の実行 (RULE 3)
  useEffect(() => {
    if (!auth) return;
    const login = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        setError("認証エラーが発生しました。");
      }
    };
    login();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳のリアルタイム同期 (RULE 1)
  useEffect(() => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(vocabCol, (snapshot) => {
      // 2025-12-12にリクエストされた「覚えるべき単語リスト」をFirestoreから同期
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore Error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // AIによる英会話生成 (Gemini API)
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `シチュエーション: ${userInput}` }] }],
            systemInstruction: { parts: [{ text: "あなたは英会話コーチです。日本語の状況から自然な英語会話を生成してください。出力は必ずJSONで、title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning, usage}] を含めてください。" }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      const data = await response.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        setResult(JSON.parse(data.candidates[0].content.parts[0].text));
        setUserInput("");
      }
    } catch (err) {
      setError("AI生成に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // 音声読み上げ (Gemini TTS)
  const playTTS = async (text, id) => {
    if (!text || isPlayingAudio) return;
    setIsPlayingAudio(id);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
            generationConfig: { 
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
            }
          })
        }
      );
      const data = await response.json();
      const base64Data = data.candidates[0].content.parts[0].inlineData.data;
      const audio = new Audio(`data:audio/wav;base64,${base64Data}`);
      audio.onended = () => setIsPlayingAudio(null);
      audio.play();
    } catch (err) { 
      setIsPlayingAudio(null); 
    }
  };

  const saveToVocab = async (item) => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    await addDoc(vocabCol, { ...item, createdAt: new Date().toISOString() });
  };

  const deleteVocab = async (id) => {
    if (!user || !db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocabulary', id));
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 text-slate-900 leading-relaxed">
      <nav className="bg-white border-b px-6 py-5 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold italic shadow-lg">S</div>
          <span className="font-bold text-xl tracking-tight">SceneMaster Pro</span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {view === 'landing' && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-10 animate-bounce">
              <Sparkles className="text-white w-12 h-12" />
            </div>
            <h1 className="text-5xl font-black mb-6">Learn English</h1>
            <p className="text-xl text-slate-500 mb-12">
              呟くだけで、あなただけの英会話レッスンを生成。
            </p>
            <div className="flex flex-col w-full gap-5 max-w-xs">
              <button onClick={() => setView('generator')} className="bg-indigo-600 text-white font-bold py-5 rounded-2xl flex items-center justify-center shadow-xl hover:bg-indigo-700 text-lg">
                会話を生成する
              </button>
              <button onClick={() => setView('vocab')} className="bg-white text-slate-600 font-bold py-5 rounded-2xl border flex items-center justify-center gap-2 text-lg">
                マイスペース（単語帳）
              </button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border shadow-sm">
              <label className="block text-xs font-black text-indigo-600 mb-2 uppercase tracking-widest">今の状況は？</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  className="flex-1 bg-slate-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="例: スタバで注文..."
                />
                <button onClick={generateContent} disabled={isLoading} className="bg-indigo-600 text-white p-3 rounded-xl">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
                </button>
              </div>
            </div>

            {result && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <div className="bg-slate-900 text-white p-6 rounded-3xl">
                  <h3 className="text-xl font-bold">{result.title}</h3>
                  <p className="text-slate-400 text-sm">{result.context}</p>
                </div>
                {result.dialogue.map((line, i) => (
                  <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 ${i % 2 === 0 ? 'bg-white border-l-4 border-indigo-500' : 'bg-indigo-600 text-white'}`}>
                      <div className="flex justify-between items-center mb-1 gap-4">
                        <span className="text-[10px] font-bold opacity-50">{line.speaker}</span>
                        <button onClick={() => playTTS(line.english, `d-${i}`)} className="opacity-70"><Volume2 className="w-4 h-4" /></button>
                      </div>
                      <p className="text-lg font-bold">{line.english}</p>
                      <p className="text-xs mt-2 border-t pt-2 opacity-60">{line.japanese}</p>
                    </div>
                  </div>
                ))}
                <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b font-bold flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />重要表現</div>
                  {result.key_phrases.map((item, i) => (
                    <div key={i} className="p-4 flex justify-between items-center border-b last:border-0">
                      <div>
                        <p className="font-bold text-indigo-600">{item.phrase}</p>
                        <p className="text-sm">{item.meaning}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => playTTS(item.phrase, `p-${i}`)} className="p-2 text-slate-300"><Volume2 className="w-5 h-5"/></button>
                        <button onClick={() => saveToVocab(item)} className="p-2 text-slate-300 hover:text-amber-500"><Star className="w-5 h-5"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div className="space-y-4">
            <h2 className="text-3xl font-black">My Vocab</h2>
            {vocabList.length === 0 ? (
              <p className="text-center py-20 text-slate-400 border-2 border-dashed rounded-3xl">単語帳は空です。</p>
            ) : (
              vocabList.map(item => (
                <div key={item.id} className="bg-white p-5 rounded-3xl shadow-sm border flex justify-between items-center">
                  <div>
                    <p className="font-bold text-xl">{item.phrase}</p>
                    <p className="text-indigo-600 font-bold">{item.meaning}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => playTTS(item.phrase, item.id)} className="p-2 text-slate-300"><Volume2 className="w-6 h-6"/></button>
                    <button onClick={() => deleteVocab(item.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-6 h-6"/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900 text-white rounded-full p-2 flex justify-around shadow-2xl z-50">
        <button onClick={() => setView('landing')} className={`p-4 rounded-full ${view === 'landing' ? 'bg-indigo-600' : 'text-slate-500'}`}><Home className="w-7 h-7"/></button>
        <button onClick={() => setView('generator')} className={`p-4 rounded-full ${view === 'generator' ? 'bg-indigo-600' : 'text-slate-500'}`}><MessageCircle className="w-7 h-7"/></button>
        <button onClick={() => setView('vocab')} className={`p-4 rounded-full ${view === 'vocab' ? 'bg-indigo-600' : 'text-slate-500'}`}><BookOpen className="w-7 h-7"/></button>
      </div>
    </div>
  );
};

export default App;