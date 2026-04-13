import { useState } from 'react'
import PhotoUploadPage from './PhotoUploadPage'
import AudioUploadSection from '../components/AudioUploadSection'

export default function UploadPage() {
  const [tab, setTab] = useState<'photo' | 'audio'>('photo')

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('photo')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'photo'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-900/80 text-gray-400 hover:text-gray-50'
          }`}
        >
          Photo
        </button>
        <button
          onClick={() => setTab('audio')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'audio'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-900/80 text-gray-400 hover:text-gray-50'
          }`}
        >
          Audio
        </button>
      </div>

      {tab === 'photo' ? <PhotoUploadPage /> : <AudioUploadSection />}
    </div>
  )
}
