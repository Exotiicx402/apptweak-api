interface AppSectionHeaderProps {
  appName: string;
  appId: string;
  iconUrl: string;
}

export const AppSectionHeader = ({ appName, appId, iconUrl }: AppSectionHeaderProps) => {
  return (
    <div className="flex items-center gap-3 mb-4">
      <img 
        src={iconUrl} 
        alt={`${appName} icon`}
        className="w-10 h-10 rounded-xl shadow-md"
      />
      <div>
        <h2 className="text-lg font-semibold text-foreground">{appName}</h2>
        <p className="text-xs text-muted-foreground">App ID: {appId}</p>
      </div>
    </div>
  );
};
