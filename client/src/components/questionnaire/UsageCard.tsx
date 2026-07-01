import { UsageMode } from "@/types/questionnaire";
import { User, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface UsageCardProps {
  mode: UsageMode;
  selected: boolean;
  onClick: () => void;
}

export function UsageCard({ mode, selected, onClick }: UsageCardProps) {
  const { t } = useLanguage();
  const content = {
    personal: {
      icon: User,
      ...t.onboard.usageCard.personal,
    },
    professional: {
      icon: Users,
      ...t.onboard.usageCard.professional,
    },
  };

  const { icon: Icon, title, description } = content[mode];

  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[280px] p-6 rounded-2xl text-left transition-all duration-300 border ${
        selected
          ? "bg-[#02c950]/30 border-[#02c950] shadow-[0_0_30px_rgba(2,201,80,0.4)]"
          : "bg-[#1a1a1a] border-white/30 hover:bg-[#222222] hover:border-white/40"
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all ${
        selected ? "bg-[#02c950]" : "bg-white/10"
      }`}>
        <Icon className={`w-6 h-6 ${selected ? "text-black" : "text-gray-400"}`} />
      </div>
      <h3 className={`text-lg font-semibold mb-2 ${selected ? "text-white" : "text-gray-300"}`}>
        {title}
      </h3>
      <p className="text-sm text-gray-400 leading-relaxed">
        {description}
      </p>
    </button>
  );
}
