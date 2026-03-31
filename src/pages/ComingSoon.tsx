import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Bell } from "lucide-react";

interface ComingSoonProps {
  sport: string;
}

const ComingSoon = ({ sport }: ComingSoonProps) => {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <Card className="p-12 text-center space-y-6">
          <Trophy className="h-16 w-16 text-primary mx-auto opacity-50" />
          <h1 className="text-4xl font-bold">{sport} Statistics</h1>
          <p className="text-xl text-muted-foreground">Coming Soon</p>
          <p className="text-muted-foreground max-w-md mx-auto">
            We're working hard to bring you comprehensive {sport} statistics and analytics. 
            Be the first to know when we launch!
          </p>
          <div className="pt-4">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Bell className="h-4 w-4 mr-2" />
              Notify Me
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ComingSoon;
