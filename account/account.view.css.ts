namespace $.$$ {
	$mol_style_define($bog_vk_account, {
		flex: { direction: 'column' },
		width: '100%',
		boxSizing: 'border-box',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		gap: '0.75rem',

		Sync_row: {
			alignItems: 'center',
			gap: '0.5rem',
			padding: { left: '0.25rem', right: '0.25rem' },
		},

		Download_all_status: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			flex: { grow: 1 },
		},

		Cards: {
			display: 'grid',
			gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
			gap: '0.75rem',
			alignItems: 'start',
		},

		Profile: {
			flex: { direction: 'column' },
			background: { color: $mol_theme.card },
			border: { radius: $mol_gap.round },
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: '0.5rem',
		},

		Lord: {
			font: {
				family: 'monospace',
				size: '0.875rem',
			},
			alignItems: 'baseline',
			padding: { top: '0.25rem', bottom: '0.25rem' },
			gap: '0.5rem',
		},

		Export: {
			flex: { direction: 'column' },
			background: { color: $mol_theme.card },
			border: { radius: $mol_gap.round },
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: '0.5rem',
		},

		Warning: {
			font: { size: '0.8125rem' },
			color: '#d33',
		},

		Copy_status: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			minHeight: '1rem',
		},

		Import: {
			flex: { direction: 'column' },
			background: { color: $mol_theme.card },
			border: { radius: $mol_gap.round },
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: '0.5rem',
		},

		Import_hint: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
		},

		Import_status: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			minHeight: '1rem',
		},

		Reset: {
			flex: { direction: 'column' },
			background: { color: $mol_theme.card },
			border: { radius: $mol_gap.round },
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: '0.5rem',
		},

		Reset_hint: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
		},
	})
}
