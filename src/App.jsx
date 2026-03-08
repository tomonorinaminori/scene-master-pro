import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  deleteDoc,
  query
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

// --- 環境設定 ---
// 実行環境から提供されるグローバル変数を使用するように修正し、
// "import.meta" によるエラーを回避します。
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };

// Gemini APIキー（実行環境より提供されるため空文字列に設定）
const apiKey = ""; 
const appId = typeof __app_id !== 'undefined' ? __app_id : 'scene-master-pro-v1';

// Firebase の初期化
let app, auth, db;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
auth = getAuth(app);
db = getFirestore(app);

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [vocabList, setVocabList] = useState([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(null);
  const [error, setError] = useState(null);

  // 1. 認証処理 (RULE 3 準拠)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setError("認証エラーが発生しました。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳のリアルタイム同期 (RULE 1 & 2 準拠)
  useEffect(() => {
    if (!user || !db) return;
    
    // 公開データではなく、ユーザーごとのプライベートパスを使用
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const q = query(vocabCol);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore sync error:", err);
    });
    
    return () => unsubscribe();
  }, [user]);

  // AIによる英会話生成（指数バックオフ付き）
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);

    const callApi = async (retries = 5, delay = 1000) => {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `シチュエーション: ${userInput}` }] }],
              systemInstruction: { parts: [{ text: "プロの英会話コーチとして、自然な会話と重要語彙をJSON形式で提供してください。形式: {title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning, usage}]}" }] },
              generationConfig: { 
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING" },
                    context: { type: "STRING" },
                    dialogue: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          speaker: { type: "STRING" },
                          english: { type: "STRING" },
                          japanese: { type: "STRING" }
                        }
                      }
                    },
                    key_phrases: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          phrase: { type: "STRING" },
                          meaning: { type: "STRING" },
                          usage: { type: "STRING" }
                        }
                      }
                    }
                  }
                }
              }
            })
          }
        );
        
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No content returned');
        
        setResult(JSON.parse(text));
        setUserInput("");
      } catch (err) {
        if (retries > 0) {
          await new Promise(res => setTimeout(res, delay));
          return callApi(retries - 1, delay * 2);
        }
        setError("AI生成中にエラーが発生しました。");
      } finally {
        setIsLoading(false);
      }
    };

    await callApi();
  };

  // TTS (PCM to WAV 変換付き)
  const playTTS = async (text, id) => {
    if (!text || isPlayingAudio) return;
    setIsPlayingAudio(id);

    const callTts = async (retries = 5, delay = 1000) => {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: text }] }],
              generationConfig: { 
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
              },
              model: "gemini-2.5-flash-preview-tts"
            })
          }
        );

        if (!response.ok) throw new Error('TTS failed');
        const data = await response.json();
        const base64Data = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Data) throw new Error('No audio data');

        const pcmToWav = (base64, sampleRate = 24000) => {
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
          const buffer = new ArrayBuffer(44 + len);
          const view = new DataView(buffer);
          const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
          };
          writeString(0, 'RIFF'); view.setUint32(4, 36 + len, true); writeString(8, 'WAVE');
          writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
          view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
          view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
          view.setUint16(34, 16, true); writeString(36, 'data'); view.setUint32(40, len, true);
          for (let i = 0; i < len; i++) view.setUint8(44 + i, bytes[i]);
          return new Blob([buffer], { type: 'audio/wav' });
        };

        const audioBlob = pcmToWav(base64Data);
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          setIsPlayingAudio(null);
          URL.revokeObjectURL(audioUrl);
        };
        await audio.play();
      } catch (err) {
        if (retries > 0) {
          await new Promise(res => setTimeout(res, delay));
          return callTts(retries - 1, delay * 2);
        }
        setIsPlayingAudio(null);
      }
    };

    await callTts();
  };

  const saveToVocab = async (item) => {
    if (!user || !db) return;
    try {
      const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
      await addDoc(vocabCol, { ...item, createdAt: new Date().toISOString() });
    } catch (err) {
      setError("保存に失敗しました。");
    }
  };

  const deleteVocab = async (id) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocabulary', id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 text-slate-900 leading-relaxed overflow-x-hidden">
      <nav className="bg-white border-b px-6 py-4 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold italic shadow-md">S</div>
          <span className="font-bold text-lg tracking-tight">SceneMaster Pro</span>
        </div>
      </nav>

      <main className="max-w-xl mx-auto p-5">
        {view === 'landing' && (
          <div className="py-20 text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-xl mb-8">
              <Sparkles className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-black mb-4 tracking-tight">English Master</h1>
            <p className="text-slate-500 mb-10 text-lg">呟くだけで、あなただけの英会話レッスンを生成。</p>
            <div className="flex flex-col gap-4 max-w-xs mx-auto">
              <button onClick={() => setView('generator')} className="bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">学習をはじめる</button>
              <button onClick={() => setView('vocab')} className="bg-white text-slate-600 font-bold py-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all">My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border shadow-sm">
              <label className="text-xs font-bold text-indigo-600 uppercase mb-2 block tracking-widest">今の状況を入力</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバで注文を間違えられた..."
                  className="flex-1 bg-slate-50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={generateContent} disabled={isLoading} className="bg-indigo-600 text-white p-3 rounded-xl shadow-md disabled:bg-slate-300">
                  {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {result && (
              <div className="space-y-6 pb-10">
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                  <h3 className="text-xl font-bold mb-1">{result.title}</h3>
                  <p className="text-slate-400 text-sm">{result.context}</p>
                </div>
                {result.dialogue.map((line, i) => (
                  <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${i % 2 === 0 ? 'bg-white border-l-4 border-indigo-600 text-slate-900' : 'bg-indigo-600 text-white'}`}>
                      <div className="flex justify-between items-center mb-1 gap-6">
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-tighter">{line.speaker}</span>
                        <button onClick={() => playTTS(line.english, `d-${i}`)} className="p-1 rounded-full hover:bg-black/5 transition-colors">
                          {isPlayingAudio === `d-${i}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-lg font-bold leading-tight">{line.english}</p>
                      <p className={`text-xs mt-2 border-t pt-2 ${i % 2 === 0 ? 'text-slate-400 border-slate-50' : 'text-indigo-100 border-indigo-500/30'}`}>{line.japanese}</p>
                    </div>
                  </div>
                ))}
                
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b font-bold text-sm flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> 重要フレーズを保存
                  </div>
                  <div className="divide-y divide-slate-100">
                    {result.key_phrases.map((item, i) => (
                      <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                        <div className="flex-1 mr-4">
                          <p className="font-bold text-indigo-600 text-lg leading-tight">{item.phrase}</p>
                          <p className="text-sm text-slate-700 font-medium">{item.meaning}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => playTTS(item.phrase, `p-${i}`)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                            {isPlayingAudio === `p-${i}` ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5"/>}
                          </button>
                          <button onClick={() => saveToVocab(item)} className="p-2 text-slate-300 hover:text-amber-500 transition-colors"><Star className="w-5 h-5"/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <h2 className="text-3xl font-black text-slate-800">My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="text-center py-32 text-slate-300 border-2 border-dashed rounded-[2rem] bg-white shadow-sm">
                単語帳は空です。<br/>生成した会話の「★」ボタンで保存しましょう。
              </div>
            ) : (
              <div className="grid gap-3">
                {vocabList.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center hover:shadow-md transition-shadow">
                    <div className="flex-1 mr-4">
                      <p className="font-bold text-lg text-slate-900">{item.phrase}</p>
                      <p className="text-indigo-600 font-bold text-sm">{item.meaning}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => playTTS(item.phrase, item.id)} className="p-2 text-slate-200 hover:text-indigo-600 transition-colors">
                        {isPlayingAudio === item.id ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Volume2 className="w-6 h-6"/>}
                      </button>
                      <button onClick={() => deleteVocab(item.id)} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 className="w-6 h-6"/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900/90 backdrop-blur-xl text-white rounded-full p-2 flex justify-around shadow-2xl z-50 border border-white/10">
        <button onClick={() => setView('landing')} className={`p-4 rounded-full transition-all ${view === 'landing' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Home className="w-6 h-6"/></button>
        <button onClick={() => setView('generator')} className={`p-4 rounded-full transition-all ${view === 'generator' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><MessageCircle className="w-6 h-6"/></button>
        <button onClick={() => setView('vocab')} className={`p-4 rounded-full transition-all ${view === 'vocab' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><BookOpen className="w-6 h-6"/></button>
      </div>

      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[100] text-xs font-bold flex items-center gap-3 animate-in slide-in-from-top-4">
          <Info className="w-4 h-4 text-red-500" /> {error}
        </div>
      )}
    </div>
  );
};

export default App;
