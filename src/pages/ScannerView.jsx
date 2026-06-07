import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Image as ImageIcon, FileText, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ScannerView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'upload', 'text'
  const [capturedImage, setCapturedImage] = useState(null);
  const [pastedText, setPastedText] = useState('');
  
  // Camera specific
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      // Fallback to upload if camera fails
      setActiveTab('upload');
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'camera' && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setPastedText('');
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  const handleScan = () => {
     navigate('/review', { 
       state: { 
         image: capturedImage, 
         text: pastedText,
         isExistingScan: false
       } 
     });
  };

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden my-4">
      
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => handleTabChange('camera')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'camera' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <Camera className="w-4 h-4" /> Camera
        </button>
        <button 
          onClick={() => handleTabChange('upload')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'upload' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <ImageIcon className="w-4 h-4" /> Upload
        </button>
        <button 
          onClick={() => handleTabChange('text')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'text' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <FileText className="w-4 h-4" /> Text
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50 min-h-[400px]">
        
        {capturedImage ? (
          <div className="relative w-full max-w-md">
            <img src={capturedImage} alt="Captured" className="w-full rounded-lg shadow-md border border-slate-200 dark:border-slate-700" />
            <button 
              onClick={resetCapture}
              className="absolute top-3 right-3 p-2 bg-slate-900/70 text-white rounded-full hover:bg-slate-900/90 backdrop-blur-sm transition-colors shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : activeTab === 'camera' ? (
          <div className="w-full max-w-md aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden relative shadow-inner flex items-center justify-center">
             {stream ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
             ) : (
                <div className="text-slate-400 text-sm">Requesting camera access...</div>
             )}
             
             {stream && (
               <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                 <button 
                   onClick={capturePhoto}
                   className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 shadow-xl active:scale-95 transition-transform"
                   aria-label="Take photo"
                 />
               </div>
             )}
          </div>
        ) : activeTab === 'upload' ? (
          <div className="w-full max-w-md h-64 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-colors hover:border-emerald-400 dark:hover:border-emerald-500">
             <Upload className="w-10 h-10 text-slate-400 mb-3" />
             <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Select an image of the job flyer</p>
             <label className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium cursor-pointer transition-colors shadow-sm">
               Choose File
               <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleFileUpload} />
             </label>
          </div>
        ) : (
          <div className="w-full max-w-md flex flex-col h-full min-h-[300px]">
            <textarea 
              className="w-full flex-1 p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm text-sm"
              placeholder="Paste the job description text here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <button 
          onClick={handleScan}
          disabled={!capturedImage && !pastedText.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98]"
        >
          Scan for Risks
        </button>
      </div>
    </div>
  );
}
