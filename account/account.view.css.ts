namespace $.$$ {
	$mol_style_define($bog_vk_account, {
		width: '26rem',
		maxWidth: $mol_style_func.calc('100vw - 1rem'),
		boxSizing: 'border-box',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		gap: '0.25rem',

		Lord: {
			font: {
				family: 'monospace',
				size: '0.875rem',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
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

		Import_status: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			minHeight: '1rem',
		},

		Import_hint: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
		},
	})
}
