"use client";

import './how-it-works.css'

interface CardProps {
  number: string;
  title: string;
  description: string;
  colorTheme?: 'orange' | 'blue' | 'purple';
  className?: string;
  rotate?: string;
  colors?: { bg: string; text: string; border: string };
}

const Pin = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M16 3a1 1 0 0 1 .117 1.993l-.117 .007v4.764l1.894 3.789a1 1 0 0 1 .1 .331l.006 .116v2a1 1 0 0 1 -.883 .993l-.117 .007h-4v4a1 1 0 0 1 -1.993 .117l-.007 -.117v-4h-4a1 1 0 0 1 -.993 -.883l-.007 -.117v-2a1 1 0 0 1 .06 -.34l.046 -.107l1.894 -3.791v-4.762a1 1 0 0 1 -.117 -1.993l.117 -.007h8z" />
  </svg>
)

const Card = ({ number, title, description, colorTheme = 'blue', className, rotate, colors }: CardProps) => (
  <div className={`hiw-card ${rotate ?? ''} ${className ?? ''}`} data-color-theme={colors ? undefined : colorTheme}>
    <div className="hiw-card-shell">
      <Pin className={`hiw-pin ${colors?.text ?? ''}`} />
      <div className={`hiw-note ${colors?.bg ?? ''} ${colors?.border ?? ''}`}>
        <span className={`hiw-number ${colors?.text ?? ''}`}>{number}</span>
        <h3 className="hiw-title">{title}</h3>
        <p className="hiw-description">{description}</p>
      </div>
    </div>
  </div>
)

export interface Step {
  title: string;
  description: string;
  colorTheme?: 'orange' | 'blue' | 'purple';
  colors?: { bg: string; text: string; border: string };
}

export interface StepPosition { className?: string; rotate?: string }
export interface HowItWorksProps {
  features?: Step[];
  className?: string;
  stepPositions?: StepPosition[];
  ariaLabel?: string;
}

const defaultFeatures: Step[] = [
  { title: 'Create account', description: 'Create your account with Google or email. Simple — your wallet is made for you, no seed phrase to write down.', colorTheme: 'orange' },
  { title: 'Deposit from your card', description: 'Pay with your card. Your funds land on BNB Smart Chain, ready to trade.', colorTheme: 'blue' },
  { title: 'Choose a stock', description: 'Explore the stocks and check the token, issuer, and contract.', colorTheme: 'purple' },
  { title: 'Trade your tokenized equity', description: 'Buy and sell. Own your first tokenized stock in under a minute.', colorTheme: 'orange' },
]

// Preserve the supplied pinned notes in a horizontal, locally scrollable sequence.
export default function HowItWorks({ features, className, stepPositions, ariaLabel = 'How it works steps' }: HowItWorksProps) {
  const data = features && features.length > 0 ? features : defaultFeatures

  return (
    <div className={`how-it-works ${className ?? ''}`}>
      <div className="hiw-scroll-region" role="region" aria-label={ariaLabel} tabIndex={0}>
        <ol className="hiw-board">
          {data.map((step, index) => (
            <li className="hiw-step" key={step.title}>
              <Card
                number={String(index + 1).padStart(2, '0')}
                title={step.title}
                description={step.description}
                colorTheme={step.colorTheme}
                colors={step.colors}
                rotate={stepPositions?.[index]?.rotate}
                className={stepPositions?.[index]?.className}
              />
              {index < data.length - 1 && (
                <svg className="hiw-path-svg" viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className="hiw-connector"
                    d={index % 2 === 0 ? 'M 0 40 C 30 10, 70 70, 100 40' : 'M 0 40 C 30 70, 70 10, 100 40'}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="7 7"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
