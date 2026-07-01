import { LiveLocation } from '@/components/LiveLocation';

export default function LocationPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <LiveLocation />
      </div>
    </div>
  );
}

