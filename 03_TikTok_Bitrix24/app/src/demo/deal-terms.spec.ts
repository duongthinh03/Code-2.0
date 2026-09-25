import { DealRule, resolveDealTerms } from './demo.service';

const rule: DealRule = {
  campaignContains: 'sale',
  pipelineId: '1',
  stageId: 'NEW',
  probability: 30,
  assignedTo: 'sales-fallback',
  assignmentCriteria: [
    { campaignContains: 'sale', cityEquals: 'Hà Nội', salesPersonId: 'sales-north' },
    { campaignContains: 'sale', salesPersonId: 'sales-general' },
  ],
  formCompletionBonus: 15,
  interactionBonus: 5,
};

describe('mock Deal terms', () => {
  it('assigns by campaign and city and calculates engagement probability', () => {
    expect(resolveDealTerms(rule,
      { campaign_name: 'Spring Sale', campaign_id: 'spring-sale', city: 'HÀ NỘI' },
      { forms: 1, interactions: 2 },
    )).toEqual({ assignedTo: 'sales-north', probability: 55 });
  });

  it('uses a fallback sales person and caps probability', () => {
    expect(resolveDealTerms(rule,
      { campaign_name: 'Organic', campaign_id: 'organic', city: null },
      { forms: 5, interactions: 5 },
    )).toEqual({ assignedTo: 'sales-fallback', probability: 100 });
  });
});
