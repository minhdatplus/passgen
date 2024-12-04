"use client"

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Button } from './ui/button'
import { useToast } from '@/hooks/use-toast'
import { motion } from 'framer-motion'
import { Copy, RefreshCw, Shield, AlertTriangle, CheckCircle, XCircle, Globe, Settings2, Sparkles, Hash, Brain, Loader2, Wand2, AlertCircle, HelpCircle } from 'lucide-react'
import { generatePassword } from '@/lib/generators'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { ContextAnalyzer, ServiceContext, PasswordRequirements } from '@/lib/context-analyzer'
import { PatternGenerator } from '@/lib/pattern-generator'
import { MemorableGenerator } from '@/lib/memorable-generator'
import { PasswordAnalysis, GeneratorConfig, GenerationResult, PasswordMetadata, HistoryMetadata } from '@/lib/types'
import { HistoryManagementService } from '@/lib/history-management'
import { BreachDatabase } from '@/lib/breach-database'
import { Input } from '@/components/ui/input'
import { generatePatternFromRequirements, calculateTimeToCrack } from '@/lib/utils'
import { Textarea } from "@/components/ui/textarea"
import { PasswordOutput } from "./password/password-output"
import { BasicOptionsV2 } from "./password/basic-options-v2"
import { ContextOptions } from "./password/context-options"
import { PatternOptions } from "./password/pattern-options"
import { MemorableOptions } from "./password/memorable-options"
import { analyzePassword } from "./password/password-output"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { PasswordRules } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { MethodComparison } from "./password/method-comparison"
import { SecurityTips } from "./password/security-tips"
import { UseCases } from "./password/use-cases"

interface PasswordOptions {
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  memorable: boolean
  quantumSafe: boolean
}

type GenerationMode = 'basic' | 'context' | 'pattern' | 'memorable';

function getMethodDescription(mode: string): JSX.Element {
  switch (mode) {
    case 'basic':
      return (
        <>
          <h4 className="font-medium">Standard Password Generation</h4>
          <ul className="text-sm space-y-1 list-disc pl-4">
            <li>Customize length and character types</li>
            <li>Strong and secure by default</li>
            <li>Perfect for general use</li>
          </ul>
        </>
      );
    case 'context':
      return (
        <>
          <h4 className="font-medium">AI-Powered Context Analysis</h4>
          <ul className="text-sm space-y-1 list-disc pl-4">
            <li>Analyzes your specific requirements</li>
            <li>Suggests optimal password rules</li>
            <li>Best for specific platforms/services</li>
          </ul>
        </>
      );
    case 'pattern':
      return (
        <>
          <h4 className="font-medium">Custom Pattern-Based</h4>
          <ul className="text-sm space-y-1 list-disc pl-4">
            <li>Define your own password pattern</li>
            <li>Control exact character placement</li>
            <li>Useful for specific format requirements</li>
          </ul>
        </>
      );
    case 'memorable':
      return (
        <>
          <h4 className="font-medium">Easy to Remember</h4>
          <ul className="text-sm space-y-1 list-disc pl-4">
            <li>Creates memorable word combinations</li>
            <li>Still maintains security standards</li>
            <li>Great for frequently typed passwords</li>
          </ul>
        </>
      );
    default:
      return <></>;
  }
}

const tabItems = [
  { 
    value: 'basic' as GenerationMode,
    icon: <Settings2 className="h-4 w-4" />,
    label: 'Basic',
    shortLabel: 'Basic'
  },
  { 
    value: 'context' as GenerationMode,
    icon: <Sparkles className="h-4 w-4" />,
    label: 'AI Context',
    shortLabel: 'AI'
  },
  { 
    value: 'pattern' as GenerationMode,
    icon: <Hash className="h-4 w-4" />,
    label: 'Pattern',
    shortLabel: 'Pattern'
  },
  { 
    value: 'memorable' as GenerationMode,
    icon: <Brain className="h-4 w-4" />,
    label: 'Memorable',
    shortLabel: 'Memo'
  }
] as const;

export function PasswordGenerator() {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [analysis, setAnalysis] = useState<PasswordAnalysis | null>(null)
  const [length, setLength] = useState([16])
  const [options, setOptions] = useState<PasswordOptions>({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    memorable: false,
    quantumSafe: true
  })
  const [usePattern, setUsePattern] = useState(false);
  const [pattern, setPattern] = useState('');
  const [useMemorable, setUseMemorable] = useState(false);
  const [memorableOptions, setMemorableOptions] = useState({
    wordCount: 3,
    capitalize: true,
    includeNumbers: true,
    includeSeparators: true
  });
  const [serviceUrl, setServiceUrl] = useState('');
  const [breachResult, setBreachResult] = useState<{
    breached: boolean;
    count?: number;
  } | null>(null);
  const [mode, setMode] = useState<GenerationMode>('basic');
  const [context, setContext] = useState('');
  const [analyzedContext, setAnalyzedContext] = useState<PasswordRequirements | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextAnalyzer = new ContextAnalyzer();
  const patternGenerator = new PatternGenerator();
  const memorableGenerator = new MemorableGenerator();
  const historyService = HistoryManagementService.getInstance()
  const breachDb = BreachDatabase.getInstance();

  useEffect(() => {
    if (usePattern) {
      setOptions(prev => ({
        ...prev,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false
      }))
    }
  }, [usePattern])

  const handleContextAnalysis = useCallback((requirements: PasswordRequirements) => {
    // Cập nhật độ dài dựa trên yêu cầu mới
    setLength([requirements.passwordRules.length.min]);

    // Cập nhật các tùy chọn dựa trên yêu cầu ký tự
    setOptions(prev => ({
      ...prev,
      uppercase: requirements.passwordRules.characterRequirements.allowedCharacterSets
        .some(set => set.type === 'uppercase' && set.required),
      lowercase: requirements.passwordRules.characterRequirements.allowedCharacterSets
        .some(set => set.type === 'lowercase' && set.required),
      numbers: requirements.passwordRules.characterRequirements.allowedCharacterSets
        .some(set => set.type === 'number' && set.required),
      symbols: requirements.passwordRules.characterRequirements.allowedCharacterSets
        .some(set => set.type === 'symbol' && set.required)
    }));

    setAnalyzedContext(requirements);
  }, []);

  const validatePasswordForService = useCallback((password: string) => {
    if (!serviceUrl) return true;
    
    const context = contextAnalyzer.analyzeContext(serviceUrl);
    const requirements = contextAnalyzer.suggestRequirements(context);

    // Kiểm tra độ dài
    const meetsLength = password.length >= requirements.passwordRules.length.min;

    // Kiểm tra các ký tự bắt buộc
    const hasRequiredChars = requirements.passwordRules.characterRequirements.allowedCharacterSets
      .filter(set => set.required)
      .every(set => {
        switch (set.type) {
          case 'uppercase': return /[A-Z]/.test(password);
          case 'lowercase': return /[a-z]/.test(password);
          case 'number': return /\d/.test(password);
          case 'symbol': return /[!@#$%^&*()_+\-=[\]{};:,.<>?]/.test(password);
          default: return true;
        }
      });

    // Kiểm tra các ký tự bị cấm
    const noExcludedChars = !requirements.passwordRules.customConstraints
      .filter(constraint => constraint.type === 'excluded-chars')
      .some(constraint => 
        constraint.parameters.chars.some((char: string) => password.includes(char))
      );

    return meetsLength && hasRequiredChars && noExcludedChars;
  }, [serviceUrl]);

  const handleGeneratePassword = async () => {
    setIsGenerating(true);
    try {
      const config: GeneratorConfig = {
        mode,
        length: length[0],
        options: options,
        memorableOptions: mode === 'memorable' ? memorableOptions : undefined,
        pattern: mode === 'pattern' ? pattern : undefined,
        context: mode === 'context' && analyzedContext 
          ? {
              type: analyzedContext.platformType.type as 'financial' | 'social' | 'email' | 'general',
              domain: analyzedContext.platformType.description,
              securityLevel: analyzedContext.securityAssessment.level,
              requirements: analyzedContext
            }
          : undefined
      };

      const result = await generatePassword(config);
      setPassword(result.password);
      setAnalysis(result.analysis);
      
      // Check for breaches
      const breachCheck = await breachDb.checkPassword(result.password);
      setBreachResult(breachCheck);

    } catch (error) {
      console.error('Generation error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to generate password'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!password) return
    await navigator.clipboard.writeText(password)
    toast({
      title: 'Copied!',
      description: 'Password copied to clipboard',
    })
  }

  const handleModeChange = (newMode: GenerationMode) => {
    // Reset state
    setMode(newMode);
    setPassword('');
    setAnalysis(null);
    setBreachResult(null);
    
    // Reset mode-specific state
    switch (newMode) {
      case 'basic':
        setOptions({
          uppercase: true,
          lowercase: true,
          numbers: true,
          symbols: true,
          memorable: false,
          quantumSafe: true
        });
        setLength([16]);
        break;
        
      case 'context':
        setContext('');
        setAnalyzedContext(null);
        break;
        
      case 'pattern':
        setPattern('');
        break;
        
      case 'memorable':
        setMemorableOptions({
          wordCount: 3,
          capitalize: true,
          includeNumbers: true,
          includeSeparators: true
        });
        break;
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
          case 'g':
            e.preventDefault();
            handleGeneratePassword();
            break;
          case 'c':
            e.preventDefault();
            if (password) copyToClipboard();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [password]);

  return (
    <Card className="h-full">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl sm:text-2xl font-semibold">
              Password Generator
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose a generation method below
            </p>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-primary/10 transition-colors"
              >
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Password Generation Guide</DialogTitle>
                <DialogDescription>
                  Choose the best method for your needs
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <MethodComparison />
                <SecurityTips />
                <UseCases />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs 
          value={mode} 
          onValueChange={(value) => handleModeChange(value as GenerationMode)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 p-1 bg-muted rounded-lg h-auto">
            {tabItems.map(tab => (
              <TooltipProvider key={tab.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger 
                      value={tab.value}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 px-3 rounded-md transition-all",
                        "hover:bg-background hover:text-primary hover:shadow-sm",
                        "data-[state=active]:bg-background",
                        "data-[state=active]:text-primary",
                        "data-[state=active]:shadow-sm",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "transition-colors",
                          "group-hover:text-primary",
                          "data-[state=active]:text-primary"
                        )}>
                          {tab.icon}
                        </span>
                        <span className={cn(
                          "hidden sm:inline font-medium",
                          "group-hover:text-primary",
                          "data-[state=active]:text-primary"
                        )}>
                          {tab.label}
                        </span>
                        <span className={cn(
                          "sm:hidden font-medium",
                          "group-hover:text-primary",
                          "data-[state=active]:text-primary"
                        )}>
                          {tab.shortLabel}
                        </span>
                      </div>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="w-64 p-3">
                    {getMethodDescription(tab.value)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* Password Output Component */}
        <PasswordOutput 
          password={password}
          analysis={analysis}
          onGenerate={handleGeneratePassword}
          onCopy={copyToClipboard}
        />

        {/* Generation Options based on mode */}
        {mode === 'basic' && (
          <BasicOptionsV2 
            options={options}
            onChange={setOptions}
            length={length}
            onLengthChange={setLength}
          />
        )}

        {mode === 'context' && (
          <ContextOptions 
            context={context}
            onContextChange={setContext}
            analyzedContext={analyzedContext}
            onAnalyze={handleContextAnalysis}
          />
        )}

        {mode === 'pattern' && (
          <PatternOptions 
            pattern={pattern}
            onChange={setPattern}
          />
        )}

        {mode === 'memorable' && (
          <MemorableOptions 
            options={memorableOptions}
            onChange={setMemorableOptions}
          />
        )}

        {/* Generate Button */}
        <Button 
          className="w-full mt-8 h-12 text-base" 
          size="lg"
          onClick={handleGeneratePassword}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span>Generating secure password...</span>
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-5 w-5" />
              <span>Generate Strong Password</span>
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// Helper function to validate password against analyzed context
function validatePasswordAgainstContext(password: string, context: PasswordRequirements): boolean {
    // Kiểm tra độ dài
    if (password.length < context.passwordRules.length.min) return false;
    if (context.passwordRules.length.max && password.length > context.passwordRules.length.max) return false;

    // Đếm số loại ký tự được sử dụng
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSymbols = /[!@#$%^&*()_+\-=[\]{};:,.<>?]/.test(password);

    // Kiểm tra các yêu cầu bắt buộc
    const requiredSets = context.passwordRules.characterRequirements.allowedCharacterSets
        .filter(set => set.required);

    for (const set of requiredSets) {
        switch (set.type) {
            case 'uppercase':
                if (!hasUppercase) return false;
                break;
            case 'lowercase':
                if (!hasLowercase) return false;
                break;
            case 'number':
                if (!hasNumbers) return false;
                break;
            case 'symbol':
                if (!hasSymbols) return false;
                break;
        }
    }

    // Kiểm tra số lượng loại ký tự tối thiểu
    const { count: requiredCount } = context.passwordRules.characterRequirements.requiredCombinations;
    if (requiredCount) {
        const usedTypes = [hasUppercase, hasLowercase, hasNumbers, hasSymbols]
            .filter(Boolean).length;
        if (usedTypes < requiredCount) return false;
    }

    // Kiểm tra các ràng buộc tùy chỉnh
    for (const constraint of context.passwordRules.customConstraints) {
        if (constraint.type === 'excluded-chars' && constraint.parameters.chars) {
            for (const char of constraint.parameters.chars) {
                if (password.includes(char)) return false;
            }
        }
    }

    return true;
}

// Helper function to validate password against rules
function validatePasswordAgainstRules(password: string, rules: PasswordRules): boolean {
  // Length check
  if (password.length < rules.minLength) {
    console.log('Failed length check');
    return false;
  }
  if (rules.maxLength && password.length > rules.maxLength) {
    console.log('Failed max length check');
    return false;
  }

  // Character types check
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[!@#$%^&*()_+\-=[\]{};:,.<>?]/.test(password);

  let charTypesUsed = 0;
  if (rules.requiredCharTypes.uppercase && hasUppercase) charTypesUsed++;
  if (rules.requiredCharTypes.lowercase && hasLowercase) charTypesUsed++;
  if (rules.requiredCharTypes.numbers && hasNumbers) charTypesUsed++;
  if (rules.requiredCharTypes.symbols && hasSymbols) charTypesUsed++;

  if (charTypesUsed < rules.minCharTypesRequired) {
    console.log('Failed character types check', {
      required: rules.minCharTypesRequired,
      used: charTypesUsed
    });
    return false;
  }

  // Pattern checks
  if (!rules.patterns.allowCommonWords && /\b[a-z]{4,}\b/i.test(password)) {
    console.log('Failed common words check');
    return false;
  }
  if (!rules.patterns.allowKeyboardPatterns && /qwerty|asdf|zxcv/i.test(password)) {
    console.log('Failed keyboard patterns check');
    return false;
  }
  if (!rules.patterns.allowRepeatingChars && /(.)\1{2,}/.test(password)) {
    console.log('Failed repeating chars check');
    return false;
  }
  if (!rules.patterns.allowSequentialChars && /123|abc/i.test(password)) {
    console.log('Failed sequential chars check');
    return false;
  }

  // Excluded chars check
  for (const char of rules.excludedChars) {
    if (password.includes(char)) {
      console.log('Failed excluded chars check:', char);
      return false;
    }
  }

  return true;
}

// Helper function to convert pattern warnings to structured format
function convertPatternWarnings(warnings: string[]): {
  hasCommonWords: boolean;
  hasKeyboardPatterns: boolean;
  hasRepeatingChars: boolean;
  hasSequentialChars: boolean;
} {
  return {
    hasCommonWords: warnings.some(w => w.toLowerCase().includes('common word')),
    hasKeyboardPatterns: warnings.some(w => w.toLowerCase().includes('keyboard pattern')),
    hasRepeatingChars: warnings.some(w => w.toLowerCase().includes('repeating')),
    hasSequentialChars: warnings.some(w => w.toLowerCase().includes('sequential'))
  };
}