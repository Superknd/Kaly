import { Component } from '@angular/core';

@Component({
  selector: 'app-feature-marquee',
  templateUrl: './feature-marquee.html',
  styleUrl: './feature-marquee.scss'
})
export class FeatureMarquee {
  readonly rows = [
    {
      label: 'Numérisation, correction de perspective, fusion PDF et images, dossiers, OCR',
      features: [
        'Scan de documents',
        'Correction de perspective',
        'Fusion PDF et images',
        'Organisation par dossiers',
        'OCR en français'
      ]
    },
    {
      label: 'Extraction de pages, conversion, compression, confidentialité, gratuité',
      features: [
        'Extraction de pages',
        'Conversion en PDF',
        'Compression de documents',
        'Stockage privé',
        'Outils gratuits'
      ]
    }
  ];
}
