import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, Instagram, Video, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Socials = () => {
  const navigate = useNavigate();
  const socialLinks = [
    {
      name: "Instagram",
      icon: Instagram,
      handle: "@neekosportsstats",
      description: "Visual stats and highlights",
      url: "#",
    },
    {
      name: "TikTok",
      icon: Video,
      handle: "@neekosportsstats",
      description: "Follow us on TikTok for highlights, updates, and quick analytics",
      url: "https://www.tiktok.com/",
    },
    {
      name: "Facebook",
      icon: Facebook,
      handle: "Neeko's Sports Stats",
      description: "Community discussions and news",
      url: "#",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold">Connect With Us</h1>
          <p className="text-xl text-muted-foreground">
            Follow us on social media for the latest stats, insights, and updates
          </p>
        </div>

        <div className="grid gap-6">
          {socialLinks.map((social) => (
            <Card key={social.name} className="p-6 hover:border-primary/50 transition-all">
              <div className="flex items-center gap-6">
                <div className="p-4 rounded-full bg-primary/10">
                  <social.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1">{social.name}</h3>
                  <p className="text-sm text-primary mb-2">{social.handle}</p>
                  <p className="text-muted-foreground">{social.description}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-primary/20 hover:bg-primary/10"
                  onClick={() => window.open(social.url, '_blank')}
                >
                  Follow
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-8 text-center border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
          <h3 className="text-2xl font-bold mb-4">Stay Updated</h3>
          <p className="text-muted-foreground mb-6">
            Subscribe to our newsletter for weekly stats roundups and exclusive insights
          </p>
          <div className="flex gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Subscribe
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Socials;
